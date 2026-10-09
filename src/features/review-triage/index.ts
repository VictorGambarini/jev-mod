import * as activity from '../../core/activity'
import { setting } from '../../core/config'
import { hostOf } from '../../core/host'
import type { IO } from '../../core/io'
import { coolingOff, recordCalls } from '../../core/jev'
import { limitsOf } from '../../core/limits'
import { isPrivate, jevDir } from '../../core/settings'
import { ask, costOf, JevError, type Answer, type Asked } from '../../engine/client'
import { isSensitive, redact } from '../../engine/privacy'
import {
  attribute, capRules, decide, describeSource, diffArgs, followUpOf, HARD_CAP_FACTOR, MAX_FILES, MAX_PATHS,
  MIN_SENT_SHARE, parseDiff, projectPath, questionsOf, render, RULE_FILES, rulesIn, statsOf, summarize,
  untrackedArgs, untrackedDiff, validRef, type FileDiff, type Outcome, type QuestionId, type Source,
} from './triage'

// review-triage: a tool the model calls before it reviews a change. It reads the git diff,
// sends a capped, redacted copy to the decision model with seven yes/no questions (security,
// hard-to-undo data, public interfaces, runtime-only failures, the project's written rules,
// untested behaviour, scope), and answers quick (one review pass is enough) or full (with the
// questions and files behind it). It never replaces the review, only sets how deep the first
// pass goes.
//
// It always answers, and when it cannot decide it answers full: no key, private mode, the daily
// budget, a backend cool-off, no answer in time, a diff too large to triage, or one that is
// mostly secrets. A hunk that looks like it holds a secret is never sent, and makes it full.

const ID = 'review-triage'
/** The tool's short name; the model calls it as `mcp__jev-mod__review_triage`. */
export const TOOL = 'review_triage'
const GIT_TIMEOUT_MS = 10_000
/** Untracked files read into the diff, at most; and the largest read. */
const MAX_UNTRACKED = 50
const MAX_UNTRACKED_BYTES = 1_000_000
const MAX_INTENT_CHARS = 1000

export const SPEC = {
  name: TOOL,
  description: 'Triage a code change before you review it: call this first whenever the person asks for a review of a '
    + 'change, before /code-review or /review, or before reviewing your own edits. It reads the git diff (by default the '
    + 'uncommitted changes against HEAD, or the last commit when there are none; or the changes since `base`) and asks a '
    + 'cheap decision model seven yes/no questions: security-sensitive code, hard-to-undo data changes, public '
    + 'interfaces, runtime-only failures, the project\'s CLAUDE.md/AGENTS.md rules, behaviour changed without a test, '
    + 'and work beyond the intent. It answers "verdict: quick" (one review pass is enough) or "verdict: full" (do the '
    + 'full review, starting with the files it names), with the reasons and the diff\'s size. It never replaces the '
    + 'review: it only decides how deep the first pass goes.',
  inputSchema: {
    type: 'object',
    properties: {
      base: { type: 'string', description: 'A git ref to diff against (a branch, tag or commit; a..b for a range). Default: uncommitted changes vs HEAD, and if there are none, HEAD~1..HEAD.' },
      paths: { type: 'array', items: { type: 'string' }, description: 'Limit the diff to these files or folders (relative to the project root).' },
      intent: { type: 'string', description: 'What the change was meant to do, if you know it (the person\'s request, the PR title).' },
    },
  },
  isDeferred: false,
}

/** Whether the tool should be offered to the model now. */
export async function offered(io: IO): Promise<boolean> {
  try { return (await setting(io, ID)).mode === 'on' } catch { return false }
}

// ── reading the change ───────────────────────────────────────────────────────

type Collected = { files: FileDiff[]; source: Source } | { problem: string }

const firstLine = (text: string) => text.trim().split('\n')[0]?.slice(0, 200) || 'no output'

async function git(io: IO, argv: string[]): Promise<{ ok: boolean; out: string; err: string }> {
  try {
    const ran = await io.run(argv, { timeoutMs: GIT_TIMEOUT_MS })
    return { ok: ran.exitCode === 0, out: ran.stdout, err: ran.stderr }
  } catch (error) {
    return { ok: false, out: '', err: error instanceof Error ? error.message : String(error) }
  }
}

/** Untracked (not ignored) files as diffs that add them whole. */
async function untracked(io: IO, root: string, paths: readonly string[]): Promise<FileDiff[]> {
  const listed = await git(io, untrackedArgs(root, paths))
  if (!listed.ok) return []
  const names = listed.out.split('\0').filter(Boolean).slice(0, MAX_UNTRACKED)
  return Promise.all(names.map(async name => {
    try {
      const text = await io.readFile(`${root}/${name}`)
      return untrackedDiff(name, text.length > MAX_UNTRACKED_BYTES ? null : text)
    } catch {
      return untrackedDiff(name, null)
    }
  }))
}

/** The change, as git shows it: from `base`, else uncommitted (untracked files too), else the last commit. */
export async function collect(io: IO, root: string, base: string | undefined, paths: readonly string[]): Promise<Collected> {
  if (base) {
    let source: Source = { kind: 'base', base, mergeBase: true }
    let ran = await git(io, diffArgs(root, source, paths))
    if (!ran.ok && !base.includes('..')) {
      source = { kind: 'base', base, mergeBase: false } // a git older than 2.30, or no merge base
      ran = await git(io, diffArgs(root, source, paths))
    }
    if (!ran.ok) return { problem: `git could not diff against ${base}: ${firstLine(ran.err)}` }
    const files = parseDiff(ran.out)
    if (!base.includes('..')) files.push(...await untracked(io, root, paths))
    return { files, source }
  }
  const ran = await git(io, diffArgs(root, { kind: 'uncommitted' }, paths))
  if (!ran.ok) return { problem: `git could not read the uncommitted changes: ${firstLine(ran.err)}` }
  const files = [...parseDiff(ran.out), ...await untracked(io, root, paths)]
  if (files.length) return { files, source: { kind: 'uncommitted' } }
  const last = await git(io, diffArgs(root, { kind: 'last-commit' }, paths))
  if (!last.ok) return { files: [], source: { kind: 'uncommitted' } }
  return { files: parseDiff(last.out), source: { kind: 'last-commit' } }
}

/** The project's written rules (CLAUDE.md, AGENTS.md), redacted, without lines that hold a secret, capped. */
export async function projectRules(io: IO, root: string): Promise<string[]> {
  const all: string[] = []
  for (const name of RULE_FILES) {
    try { all.push(...rulesIn(await io.readFile(`${root}/${name}`))) } catch { /* not there */ }
  }
  return capRules(all.filter(rule => !isSensitive(rule)).map(rule => redact(rule, 400)))
}

// ── asking ───────────────────────────────────────────────────────────────────

type Calls = { calls: Asked[]; errors: string[]; refused?: string }

async function askOnce(io: IO, state: unknown, questions: Record<string, unknown>, deadline: number, calls: Calls,
  limits: Awaited<ReturnType<typeof limitsOf>>): Promise<Record<string, Answer> | null> {
  if (limits) {
    const [allowed, reason] = await limits.admit(false)
    if (!allowed) { calls.refused = reason || 'the daily budget is spent'; return null }
  }
  try {
    const reply = await ask(hostOf(io), state, questions, { timeoutMs: Math.max(0, deadline - Date.now()), retries: 0 })
    calls.calls.push(reply)
    if (limits) await limits.charge(costOf(reply))
    return reply.answers
  } catch (error) {
    if (!(error instanceof JevError)) throw error
    calls.errors.push(error.code)
    return null
  }
}

function whyNot(calls: Calls, timeoutMs: number): string {
  const code = calls.errors[0]
  if (calls.refused) return `limits: ${calls.refused}`
  if (code === 'no_key') return 'no decision backend key'
  if (code === 'timeout') return `no answer within ${timeoutMs} ms`
  if (code === 'state_too_large') return 'the diff summary was too large to send'
  return code ? `the decision backend failed: ${code}` : 'the decision model gave no answer'
}

// ── the tool ─────────────────────────────────────────────────────────────────

type Input = { base?: unknown; paths?: unknown; intent?: unknown }

/** Full, with why triage did not decide; nothing was asked. */
function undecided(base: Omit<Outcome, 'verdict' | 'by'>, reason: string, by = 'nothing: the decision model was not asked'): string {
  return render({ ...base, verdict: 'full', notes: [...(base.notes ?? []), `triage could not decide: ${reason}`], by })
}

/** The tool's answer, as text for the model. Never throws: a failure is said in the text, as verdict full. */
export async function triage(io: IO, input: Input): Promise<string> {
  try {
    const mine = await setting(io, ID)
    if (mine.mode !== 'on') return 'review_triage is off (/jev-mod review-triage on turns it on); do the full review.'
    const minConfidence = Number(mine.knobs.minConfidence?.value ?? 0.8)
    const maxDiffChars = Number(mine.knobs.maxDiffChars?.value ?? 12000)
    const timeoutMs = Number(mine.knobs.timeoutMs?.value ?? 8000)

    const root = (await io.projectRoot())?.replace(/\/+$/, '')
    if (!root) return 'verdict: full\ndo the full review; start with these files.\nreasons:\n- triage could not decide: the project root is not known here'
    const base = typeof input.base === 'string' && input.base.trim() ? input.base.trim() : undefined
    if (base && !validRef(base)) return `review_triage: base must be a git ref or range (a branch, tag, commit, or a..b), not ${JSON.stringify(base.slice(0, 80))}.`
    const given = Array.isArray(input.paths) ? input.paths : typeof input.paths === 'string' ? [input.paths] : []
    const paths: string[] = []
    for (const p of given.slice(0, MAX_PATHS)) {
      if (typeof p !== 'string' || !p.trim()) continue
      const rel = projectPath(root, p)
      if (rel === null) return `review_triage looks inside the project (${root}) only; ${p} is outside it.`
      paths.push(rel)
    }
    const intentGiven = typeof input.intent === 'string' ? input.intent.trim() : ''

    const collected = await collect(io, root, base, paths)
    if ('problem' in collected) {
      void activity.count(io, ID, 'undecided')
      return undecided({ source: base ? `changes since ${base}` : 'uncommitted changes', stats: { files: 0, added: 0, removed: 0, chars: 0 }, files: [] },
        collected.problem)
    }
    const { files, source } = collected
    const stats = statsOf(files)
    const shown = { source: describeSource(source), stats, files, minConfidence }
    if (!files.length) {
      void activity.count(io, ID, 'no-changes')
      return `review_triage found no changes to triage (${describeSource(source)}${paths.length ? `, in ${paths.join(', ')}` : ''}). Name a base (a branch or commit) to triage committed work.`
    }

    const hardCap = HARD_CAP_FACTOR * maxDiffChars
    if (stats.chars > hardCap || files.length > MAX_FILES) {
      void activity.count(io, ID, 'too-large')
      return render({ ...shown, verdict: 'full', by: 'nothing: the diff was not sent',
        notes: [`too large to triage: ${stats.chars} characters over ${files.length} files (the limit is ${hardCap} characters and ${MAX_FILES} files)`] })
    }
    if (await isPrivate(io, await jevDir(io))) { void activity.count(io, ID, 'undecided'); return undecided(shown, 'private mode') }
    if (coolingOff()) { void activity.count(io, ID, 'undecided'); return undecided(shown, 'the decision backend is cooling off after a failure') }

    const summary = summarize(files, maxDiffChars, isSensitive, text => redact(text, Math.max(4000, text.length * 2)))
    const withheld = summary.withheld
    if (withheld.length) void activity.count(io, ID, 'withheld', withheld.length)
    const sentAnything = summary.sent.some(s => s.text.trim())
    if (summary.sendableShare < MIN_SENT_SHARE || !sentAnything) {
      void activity.count(io, ID, 'undecided')
      return undecided({ ...shown, withheld }, withheld.length
        ? 'too little of the diff could be sent once the parts that look like secrets were taken out'
        : 'the diff has no text to read (binary files only)')
    }

    const notes: string[] = []
    let intent = intentGiven.slice(0, MAX_INTENT_CHARS)
    if (intent && isSensitive(intent)) { notes.push('the intent looked like it held a secret, so it was not sent'); intent = '' }
    const hasIntent = Boolean(intent)
    const rules = await projectRules(io, root)
    const skipped = rules.length ? [] : ["project rules (no rules found in the project's CLAUDE.md or AGENTS.md)"]
    const trimmed = summary.trimmed + summary.omitted > 0

    const state: Record<string, unknown> = {
      task: 'Triage a code change before it is reviewed: is a single quick review pass enough, or does it need a full review?',
      change: describeSource(source),
      stats: { files: stats.files, lines_added: stats.added, lines_removed: stats.removed },
      files: summary.sent.map(s => ({ id: s.id, path: redact(s.file.path, 300), status: s.file.status, added: s.file.added, removed: s.file.removed,
        ...(s.file.oldPath ? { renamed_from: redact(s.file.oldPath, 300) } : {}) })),
      diff: Object.fromEntries(summary.sent.map(s => [s.id, s.text])),
    }
    if (trimmed) state.diff_note = `hunks were cut to fit (${summary.trimmed} trimmed, ${summary.omitted} left out); judge what is shown`
    if (withheld.length) state.withheld_note = `${withheld.length} part(s) were not sent because they look like they hold a secret`
    if (hasIntent) state.intent = redact(intent, MAX_INTENT_CHARS)
    if (rules.length) state.project_rules = rules

    const limits = await limitsOf(io)
    const deadline = Date.now() + timeoutMs
    const calls: Calls = { calls: [], errors: [] }
    const questions = questionsOf(hasIntent, rules.length > 0)
    const answers = await askOnce(io, state, questions, deadline, calls, limits)
    if (!answers) {
      await recordCalls(io, calls.calls, calls.errors, ID)
      void activity.count(io, ID, 'undecided')
      return undecided({ ...shown, withheld, skipped, notes }, whyNot(calls, timeoutMs), 'nothing: the decision model did not answer')
    }
    const decision = decide(answers, Object.keys(questions), minConfidence)
    let attributed = new Map<QuestionId, FileDiff[]>()
    const named = summary.sent.filter(s => s.text.trim())
    if (decision.flags.length && named.length === 1) {
      for (const f of decision.flags) attributed.set(f.id, [named[0]!.file])
    } else if (decision.flags.length && named.length > 1 && deadline - Date.now() > 1000) {
      const followUp = followUpOf(decision.flags.map(f => f.id), named, hasIntent)
      const more = await askOnce(io, state, followUp, deadline, calls, limits)
      if (more) attributed = attribute(more, decision.flags, named)
    }
    await recordCalls(io, calls.calls, calls.errors, ID)
    const verdict = decision.verdict === 'quick' && !withheld.length ? 'quick' : 'full'
    void activity.count(io, ID, verdict)
    const requests = calls.calls.length
    return render({ ...shown, verdict, flags: decision.flags, attributed, hasIntent, notes, withheld, skipped, trimmed,
      by: `the decision model (${requests} request${requests === 1 ? '' : 's'})` })
  } catch (error) {
    void activity.count(io, ID, 'failed')
    return `verdict: full\ndo the full review; start with these files.\nreasons:\n- triage failed (${error instanceof Error ? error.message : String(error)})`
  }
}
