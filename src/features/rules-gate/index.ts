import { hostOf } from '../../core/host'
import * as activity from '../../core/activity'
import { inBackground } from '../../core/background'
import { setting } from '../../core/config'
import type { IO } from '../../core/io'
import { coolingOff, recordCalls } from '../../core/jev'
import { limitsOf } from '../../core/limits'
import { isPrivate, jevDir } from '../../core/settings'
import { ask, costOf, JevError } from '../../engine/client'
import { resolvePath } from '../tool-gate/rules'
import {
  changePieces, decide, describeChange, EDIT_TOOLS, foldersDown, globMatches, parseRules, questionsFor, refusal,
  relativeTo, ROOT_ONLY, RULE_FILES, RULES_DIR, selectRules, stateOf, targetOf, type Candidate, type RuleFile,
} from './rules'

// The rules gate: before Write, Edit, MultiEdit or NotebookEdit changes a file in the project,
// the decision model is shown the change and the project's written rules that apply to that file
// (CLAUDE.md, AGENTS.md and CLAUDE.local.md from the root down to the file's folder, and the
// .claude/rules files whose paths match it), one yes/no question per rule: does this change
// break it? In "on", a rule it is sure enough is broken refuses the edit (tool.check's deny, which
// the model reads as the call's error), quoting the rule and its file. In "shadow" the judgement
// runs in the background and is only counted. Edits outside the project are the tool gate's.
//
// Every failure (no answer in time, no key, private mode, the budget, the cool-off) lets the edit
// go on as Claude Code decided. Secret values in a change or a rule are masked before they are
// sent (redactSecretValues); a change or rule that only mentions a secret is judged like any other.

export const ID = 'rules-gate'

export type Gate = { decision: 'deny'; reason: string } | null

type Call = { tool: string; input: unknown; agentId?: string }

// ── reading the rule files, cached by mtime ──────────────────────────────────

const parsed = new Map<string, { mtimeMs: number; file: RuleFile }>()

/** A rule file's rules, read again only when its mtime changed. */
async function ruleFile(io: IO, full: string, source: string, mtimeMs: number): Promise<RuleFile> {
  const had = parsed.get(full)
  if (had && had.mtimeMs === mtimeMs) return had.file
  let text = ''
  try { text = await io.readFile(full) } catch { /* gone since the listing: no rules */ }
  const file = parseRules(text, source)
  parsed.set(full, { mtimeMs, file })
  return file
}

/** The .md files under .claude/rules, its subfolders included (a few levels). */
async function rulesDirFiles(io: IO, dir: string, rel: string, depth = 0): Promise<{ full: string; source: string; mtimeMs: number }[]> {
  const [files, folders] = await Promise.all([io.files(dir), depth < 3 ? io.folders(dir) : Promise.resolve([])])
  const here = files.filter(f => f.name.toLowerCase().endsWith('.md'))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(f => ({ full: `${dir}/${f.name}`, source: `${rel}/${f.name}`, mtimeMs: f.mtimeMs }))
  const below = await Promise.all(folders.sort().map(name => rulesDirFiles(io, `${dir}/${name}`, `${rel}/${name}`, depth + 1)))
  return [...here, ...below.flat()]
}

/** Every rule that applies to the file at `rel`, root first, each with how far its file is from the edited file's folder. */
export async function rulesFor(io: IO, root: string, rel: string): Promise<Candidate[]> {
  const folders = foldersDown(rel)
  const out: Candidate[] = []
  let order = 0
  const add = (file: RuleFile, distance: number) => {
    for (const rule of file.rules) out.push({ ...rule, distance, order: order++ })
  }
  for (const [i, folder] of folders.entries()) {
    const dir = folder ? `${root}/${folder}` : root
    const listed = await io.files(dir)
    const names = [...RULE_FILES, ...(folder ? [] : ROOT_ONLY)]
    const extra = folder ? [] : await io.files(`${root}/.claude`)
    for (const name of names) {
      const inClaude = name.startsWith('.claude/')
      const entry = (inClaude ? extra : listed).find(f => f.name === (inClaude ? name.slice('.claude/'.length) : name))
      if (!entry) continue
      const source = folder ? `${folder}/${name}` : name
      add(await ruleFile(io, `${root}/${source}`, source, entry.mtimeMs), folders.length - 1 - i)
    }
  }
  for (const f of await rulesDirFiles(io, `${root}/${RULES_DIR}`, RULES_DIR)) {
    const file = await ruleFile(io, f.full, f.source, f.mtimeMs)
    if (file.paths === null) add(file, folders.length - 1)
    else if (globMatches(file.paths, rel)) add(file, 0)
  }
  return out
}

// ── the gate ─────────────────────────────────────────────────────────────────

type Knobs = { minConfidence: number; maxRules: number; timeoutMs: number; maxChangeChars: number }

/**
 * What the gate makes of one edit Claude Code would allow or ask about: a deny with the rules it
 * breaks, or null to leave the verdict as it is. Off, a tool that edits nothing, or a file outside
 * the project costs one read of the config at most. In shadow everything past the config (the rule
 * files included) runs in the background, so the edit never waits for it.
 */
export async function check(io: IO, e: Call): Promise<Gate> {
  if (!EDIT_TOOLS.has(e.tool)) return null
  const resolved = await setting(io, ID)
  if (resolved.mode === 'off') return null
  const k = resolved.knobs
  if (e.agentId && k.subagents?.value === false) return null
  const knobs: Knobs = {
    minConfidence: Number(k.minConfidence?.value ?? 0.8),
    maxRules: Number(k.maxRules?.value ?? 25),
    timeoutMs: Number(k.timeoutMs?.value ?? 3000),
    maxChangeChars: Number(k.maxChangeChars?.value ?? 6000),
  }
  if (resolved.mode !== 'on') {
    inBackground(() => judge(io, e, knobs, true))
    return null
  }
  const started = Date.now()
  const verdict = await judge(io, e, knobs, false, started)
  if (!verdict) return null
  await activity.count(io, ID, 'blocked')
  return { decision: 'deny', reason: verdict }
}

/** The refusal the edit gets when a rule is judged broken, else null; every outcome but the block counted here. */
async function judge(io: IO, e: Call, knobs: Knobs, shadow: boolean, started = Date.now()): Promise<string | null> {
  const [root, home] = await Promise.all([io.projectRoot(), io.home()])
  const target = targetOf(e.input)
  if (!root || !target) return null
  const base = resolvePath(root, root, home) ?? root
  const full = resolvePath(target, base, home)
  const rel = full === null ? null : relativeTo(base, full)
  if (rel === null) return null // outside the project: the tool gate's

  // A rule that talks about secrets ("Never log API keys") is sent like any other; any secret
  // value in it is masked by questionsFor, as the change's are by describeChange.
  const all = await rulesFor(io, base, rel)
  if (!all.length) return null // no written rules for this file: nothing to judge, nothing counted

  const skip = async (): Promise<null> => { await activity.count(io, ID, 'skipped'); return null }
  let existing: string | null = null
  if (e.tool === 'Write') { try { existing = await io.readFile(full!) } catch { existing = null } }
  const change = describeChange(rel, e.tool, changePieces(e.tool, e.input, existing), knobs.maxChangeChars)
  if (!change) return skip() // nothing to judge
  if (coolingOff()) return skip()
  if (await isPrivate(io, await jevDir(io))) return skip()
  const limits = await limitsOf(io)
  if (limits && !(await limits.admit(shadow))[0]) return skip()

  const rules = selectRules(all, rel, change.text, knobs.maxRules)
  const timeoutMs = knobs.timeoutMs - (Date.now() - started)
  if (timeoutMs <= 100) return skip()
  let answers
  try {
    const asked = await ask(hostOf(io), stateOf(change, !!e.agentId), questionsFor(rules), { timeoutMs, retries: 0 })
    await Promise.all([recordCalls(io, [asked], [], ID), limits?.charge(costOf(asked))])
    answers = asked.answers
  } catch (error) {
    await recordCalls(io, [], [error instanceof JevError ? error.code : 'network'], ID)
    return skip()
  }
  const broken = decide(answers, rules, knobs.minConfidence)
  if (!broken.length) { await activity.count(io, ID, 'passed'); return null }
  if (shadow) { await activity.count(io, ID, 'would-block'); return null }
  return refusal(rel, broken)
}
