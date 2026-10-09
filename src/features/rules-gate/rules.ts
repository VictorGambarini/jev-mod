import { noul, type Answer, type Question } from '../../engine/client'
import { isSensitive, redact } from '../../engine/privacy'

// The rules gate's rules, with no IO: which rule files apply to a file, how a rule file becomes
// single rules, which rules are sent when there are too many, what the change looks like to the
// decision model, the one question per rule, and what its answers mean.
//
// A rule is a list item, a numbered item, or a short directive line, kept with its file and the
// heading it sits under, so the model that broke it can be told where it is written.

// ── which rule files apply ───────────────────────────────────────────────────

/** The rule files read in each folder from the project root down to the edited file's folder. */
export const RULE_FILES = ['CLAUDE.md', 'AGENTS.md', 'CLAUDE.local.md'] as const
/** Read at the root only: Claude Code's other place for the project's own file. */
export const ROOT_ONLY = ['.claude/CLAUDE.md'] as const
export const RULES_DIR = '.claude/rules'

/** The folders from the root ('') down to the folder `rel` is in: 'a/b/c.ts' -> ['', 'a', 'a/b']. */
export function foldersDown(rel: string): string[] {
  const parts = rel.split('/').slice(0, -1)
  return ['', ...parts.map((_, i) => parts.slice(0, i + 1).join('/'))]
}

/** A path inside the project, relative to its root, or null for one outside it (left to the tool gate). */
export function relativeTo(root: string, full: string): string | null {
  const base = root.replace(/\/+$/, '')
  if (!full.startsWith(base + '/')) return null
  const rel = full.slice(base.length + 1)
  return rel && !rel.split('/').includes('..') ? rel : null
}

/** A glob as a RegExp over a project-relative path: `**`, `*`, `?`, `{a,b}`; one with no slash matches at any depth. */
export function globToRegExp(glob: string): RegExp {
  let g = glob.trim().replace(/^\.\//, '').replace(/^\/+/, '')
  if (!g.includes('/')) g = `**/${g}`
  if (g.endsWith('/')) g += '**'
  let out = ''
  for (let i = 0; i < g.length; i++) {
    const c = g[i]!
    if (c === '*' && g[i + 1] === '*') {
      i++
      if (g[i + 1] === '/') { i++; out += '(?:.*/)?' } else out += '.*'
    } else if (c === '*') out += '[^/]*'
    else if (c === '?') out += '[^/]'
    else if (c === '{') {
      const close = g.indexOf('}', i)
      if (close === -1) { out += '\\{'; continue }
      out += '(?:' + g.slice(i + 1, close).split(',').map(alt => alt.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|') + ')'
      i = close
    } else out += c.replace(/[.+^$()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`)
}

export function globMatches(globs: readonly string[], rel: string): boolean {
  return globs.some(glob => { try { return globToRegExp(glob).test(rel) } catch { return false } })
}

// ── a rule file ──────────────────────────────────────────────────────────────

export type Rule = {
  /** The rule as written, markdown emphasis taken off. */
  text: string
  /** The file it is in, relative to the project root. */
  source: string
  /** The headings it sits under, outermost first, joined with " > "; '' at the top. */
  heading: string
}

export type RuleFile = {
  /** The front-matter's `paths:` globs, or null when it has none (it applies everywhere). */
  paths: string[] | null
  rules: Rule[]
}

const unquote = (s: string) => s.trim().replace(/^['"]|['"]$/g, '').trim()

/** The front-matter (between `---` lines at the top) and the body after it. */
export function frontMatter(text: string): { paths: string[] | null; body: string } {
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!m) return { paths: null, body: text }
  const lines = m[1]!.split(/\r?\n/)
  let paths: string[] | null = null
  for (let i = 0; i < lines.length; i++) {
    const key = /^(paths|globs)\s*:\s*(.*)$/.exec(lines[i]!)
    if (!key) continue
    const inline = key[2]!.trim()
    const found: string[] = []
    if (inline.startsWith('[')) found.push(...inline.replace(/^\[|\]$/g, '').split(',').map(unquote))
    else if (inline) found.push(...inline.split(',').map(unquote))
    else {
      for (let j = i + 1; j < lines.length; j++) {
        const item = /^\s*-\s+(.*)$/.exec(lines[j]!)
        if (!item) { if (/^\S/.test(lines[j]!)) break; continue }
        found.push(unquote(item[1]!))
      }
    }
    paths = [...(paths ?? []), ...found.filter(Boolean)]
  }
  return { paths: paths && paths.length ? paths : null, body: text.slice(m[0].length) }
}

export const MAX_RULE_CHARS = 300
const MIN_WORDS = 3

// A line that tells the reader what to do: "Use pnpm", "Never commit .env", "Tests must pass".
const DIRECTIVE = /\b(?:always|never|must|mustn'?t|should|shouldn'?t|don'?t|do not|avoid|prefer|make sure|ensure)\b/i
const IMPERATIVE = /^(?:add|always|avoid|ask|be|call|check|choose|commit|create|declare|do|document|don'?t|ensure|follow|give|handle|import|include|keep|leave|let|log|make|mark|name|never|put|read|return|run|say|send|set|show|skip|start|stop|tell|test|throw|treat|try|update|use|validate|wrap|write)\b/i

/** Markdown emphasis, links and code ticks taken off, whitespace folded. */
export function plain(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])[*_]([^*_\n]+)[*_](?=[^*\w]|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
}

const words = (text: string) => text.split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length

/**
 * The rules in one rule file: each list item (`-`, `*`, `+`, `1.`, `1)`, its wrapped lines
 * joined), and each short paragraph that reads as a directive, with the headings above it.
 * Headings, fenced code, tables, HTML comments and long prose are not rules.
 */
export function parseRules(text: string, source: string): RuleFile {
  const { paths, body } = frontMatter(text)
  const rules: Rule[] = []
  const headings: string[] = []
  let fence: string | null = null
  let item: string[] | null = null
  let para: string[] | null = null
  let inComment = false
  const heading = () => headings.filter(Boolean).join(' > ')
  const push = (raw: string, isItem: boolean) => {
    const t = plain(raw)
    if (!t || words(t) < MIN_WORDS || t.length > (isItem ? MAX_RULE_CHARS * 2 : MAX_RULE_CHARS)) return
    if (!isItem && !(DIRECTIVE.test(t) || IMPERATIVE.test(t))) return
    if (/^[^A-Za-z]*$/.test(t)) return
    const shown = t.length > MAX_RULE_CHARS ? t.slice(0, MAX_RULE_CHARS - 1) + '…' : t
    rules.push({ text: shown, source, heading: heading() })
  }
  const endItem = () => { if (item) push(item.join(' '), true); item = null }
  const endPara = () => { if (para) push(para.join(' '), false); para = null }
  const end = () => { endItem(); endPara() }

  for (const line of body.split(/\r?\n/)) {
    if (inComment) { if (line.includes('-->')) inComment = false; continue }
    const fenceAt = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence !== null) { if (fenceAt && fenceAt[1]![0] === fence[0] && fenceAt[1]!.length >= fence.length) fence = null; continue }
    if (fenceAt) { end(); fence = fenceAt[1]!; continue }
    if (/^\s*<!--/.test(line)) { end(); if (!line.includes('-->')) inComment = true; continue }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (h) {
      end()
      const level = h[1]!.length
      headings.length = level - 1
      for (let i = 0; i < level - 1; i++) headings[i] ??= ''
      headings[level - 1] = plain(h[2]!)
      continue
    }
    if (!line.trim()) { end(); continue }
    if (/^\s*\|/.test(line) || /^\s*(?:[-*_]\s*){3,}$/.test(line) || /^\s*>/.test(line)) { end(); continue }
    const li = /^\s*(?:[-*+]|\d{1,3}[.)])\s+(.*)$/.exec(line)
    if (li) { end(); item = [li[1]!.replace(/^\[[ xX]\]\s+/, '')]; continue }
    if (item) {
      // a wrapped line of the item; an indented code line under it is dropped
      if (/^\s{4,}\S/.test(line) && /[{};=()]$/.test(line.trim())) continue
      ;(item as string[]).push(line.trim())
      continue
    }
    if (/^ {4,}|^\t/.test(line) && !para) continue // indented code
    ;(para ??= []).push(line.trim())
  }
  end()
  return { paths, rules }
}

// ── choosing the rules sent ──────────────────────────────────────────────────

export type Candidate = Rule & {
  /** How many folders above the edited file's folder its file is: 0 for its own, or a matched rules file. */
  distance: number
  /** Its place in the order the files were read (root first, document order). */
  order: number
}

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'are', 'not', 'from', 'when', 'you', 'your', 'use', 'any',
  'all', 'one', 'its', 'has', 'have', 'into', 'out', 'can', 'but', 'was', 'will', 'never', 'always', 'must', 'should',
  'don', 'does', 'let', 'const', 'var', 'return', 'function', 'import', 'export', 'new', 'null', 'true', 'false', 'undefined',
  'def', 'self', 'string', 'number', 'type', 'else', 'then'])
const EXTENSION_WORDS: Record<string, string[]> = {
  ts: ['typescript'], tsx: ['typescript', 'react', 'component'], js: ['javascript'], jsx: ['javascript', 'react', 'component'],
  py: ['python'], rs: ['rust'], go: ['golang'], md: ['markdown', 'docs', 'documentation'], sql: ['database', 'migration'],
  css: ['style', 'styles'], scss: ['style', 'styles'], sh: ['shell', 'script'], yml: ['yaml', 'config'], yaml: ['config'],
  json: ['config'],
}

/** Words in text, identifiers split (camelCase, snake_case), lowercased, short and common words left out. */
export function termsOf(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9]*/g)) {
    for (const piece of m[0].replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(' ')) {
      const w = piece.toLowerCase()
      if (w.length < 3 || STOP.has(w)) continue
      out.add(w)
      if (w.length > 4 && w.endsWith('s')) out.add(w.slice(0, -1))
    }
  }
  return out
}

/** The words of a project path, and what its extension says (ts -> typescript). */
export function pathTerms(rel: string): Set<string> {
  const out = termsOf(rel.replace(/[/._-]/g, ' '))
  const ext = /\.([A-Za-z0-9]+)$/.exec(rel)?.[1]?.toLowerCase()
  if (ext) { out.add(ext); for (const w of EXTENSION_WORDS[ext] ?? []) out.add(w) }
  if (/(?:^|[/._-])(?:test|tests|spec|__tests__)(?:[/._-]|$)/i.test(rel)) out.add('test')
  return out
}

/** How much a rule is about this file and this change: path words count twice, the change's identifiers once. */
export function relevance(rule: Rule, path: Set<string>, change: Set<string>): number {
  let n = 0
  for (const w of termsOf(`${rule.text} ${rule.heading}`)) {
    if (path.has(w)) n += 2
    else if (change.has(w)) n += 1
  }
  return n
}

/** Identical rules (one in CLAUDE.md, one in AGENTS.md) are sent once: the nearer one. */
function dedupe(rules: Candidate[]): Candidate[] {
  const seen = new Map<string, Candidate>()
  for (const r of rules) {
    const key = r.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const had = seen.get(key)
    if (!had || r.distance < had.distance) seen.set(key, r)
  }
  return rules.filter(r => seen.get(r.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()) === r)
}

/**
 * The rules sent, at most `max`: all of them when they fit; else the most relevant to the
 * file's path and the change's identifiers, nearer files before farther on a tie, then the
 * order they were written in. The result keeps the written order.
 */
export function selectRules(rules: Candidate[], rel: string, changeText: string, max: number): Candidate[] {
  const unique = dedupe(rules)
  if (unique.length <= max) return unique
  const path = pathTerms(rel)
  const change = termsOf(changeText)
  const scored = unique.map(r => ({ r, score: relevance(r, path, change) }))
  scored.sort((a, b) => b.score - a.score || a.r.distance - b.r.distance || a.r.order - b.r.order)
  return scored.slice(0, max).map(s => s.r).sort((a, b) => a.order - b.order)
}

// ── the change ───────────────────────────────────────────────────────────────

export const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

/** The file a call edits, as given. */
export function targetOf(input: unknown): string | null {
  const args = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const path = typeof args.file_path === 'string' ? args.file_path : typeof args.notebook_path === 'string' ? args.notebook_path : null
  return path && path.trim() ? path : null
}

const CONTEXT_LINES = 2

/** The lines that differ between two texts, with two lines either side: the changed middle only. */
export function lineDiff(before: string, after: string): string {
  const a = before.split('\n')
  const b = after.split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  if (start === a.length && start === b.length) return ''
  const from = Math.max(0, start - CONTEXT_LINES)
  const out = [`@@ line ${start + 1} @@`]
  for (let i = from; i < start; i++) out.push(` ${a[i]}`)
  for (let i = start; i < endA; i++) out.push(`-${a[i]}`)
  for (let i = start; i < endB; i++) out.push(`+${b[i]}`)
  for (let i = endA; i < Math.min(a.length, endA + CONTEXT_LINES); i++) out.push(` ${a[i]}`)
  return out.join('\n')
}

/** The pieces of text a call writes, raw, each with its name: what is checked for secrets and then sent. */
export function changePieces(tool: string, input: unknown, existing: string | null): [string, string][] {
  const args = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  switch (tool) {
    case 'Edit':
      return [['old_string', str(args.old_string)], ['new_string', str(args.new_string)]]
    case 'MultiEdit': {
      const edits = Array.isArray(args.edits) ? args.edits : []
      return edits.flatMap((e, i) => {
        const edit = e && typeof e === 'object' ? e as Record<string, unknown> : {}
        return [[`edit_${i + 1}_old`, str(edit.old_string)], [`edit_${i + 1}_new`, str(edit.new_string)]] as [string, string][]
      })
    }
    case 'Write': {
      const content = str(args.content)
      return existing === null ? [['new_file', content]] : [['diff', lineDiff(existing, content)]]
    }
    case 'NotebookEdit':
      return [['cell', `${str(args.edit_mode) || 'replace'} ${str(args.cell_type)} cell ${str(args.cell_id)}`.trim()], ['new_source', str(args.new_source)]]
    default:
      return []
  }
}

export type Change = { file: string; tool: string; edit: Record<string, string>; text: string }

/**
 * The change as the decision model reads it: each piece redacted, the whole about `maxChars`
 * (shared between the pieces, a short piece leaving its share to the rest), or null when a
 * piece looks like it holds a secret.
 */
export function describeChange(rel: string, tool: string, pieces: [string, string][], maxChars: number): Change | null {
  if (pieces.some(([, text]) => isSensitive(text))) return null
  const edit: Record<string, string> = {}
  let left = maxChars
  const bySize = pieces.map(([name, text], i) => ({ name, text, i })).sort((x, y) => x.text.length - y.text.length)
  const given: string[] = []
  bySize.forEach((p, k) => {
    const share = Math.max(200, Math.floor(left / (bySize.length - k)))
    const shown = redact(p.text, share)
    given[p.i] = shown
    left -= Math.min(shown.length, share)
  })
  pieces.forEach(([name], i) => { edit[name] = given[i]! })
  if (tool === 'Edit' && edit.old_string === '' && edit.new_string === '') return null
  return { file: rel, tool, edit, text: pieces.map(([, t]) => t).join('\n') }
}

// ── the request ──────────────────────────────────────────────────────────────

export function stateOf(change: Change, subagent: boolean): Record<string, unknown> {
  return {
    task: 'An AI coding agent is about to change a file in a project. The project has written rules for its agents. '
      + 'Judge the change against each rule on its own. A rule about something this change does not touch is not broken; '
      + 'a rule is broken only when the change itself does what the rule forbids, or plainly leaves out what the rule '
      + 'requires of a change like this one.',
    file: change.file,
    tool: change.tool,
    made_by: subagent ? 'a subagent the agent started' : 'the agent',
    change: change.edit,
  }
}

export const questionId = (i: number) => `rule_${i + 1}`

/** One yes/no question per rule: does this change break it? */
export function questionsFor(rules: readonly Rule[]): Record<string, Question> {
  return Object.fromEntries(rules.map((r, i) => [questionId(i), noul(
    `Does this change break this rule? Rule (from ${r.source}${r.heading ? `, under "${redact(r.heading, 200)}"` : ''}): "${redact(r.text, MAX_RULE_CHARS + 50)}"`,
    {
      true: 'the change does what the rule forbids, or leaves out what it requires of this change',
      false: 'the change keeps to the rule, or the rule is not about anything this change does',
    },
  )]))
}

export type Broken = { rule: Rule; p: number }

/** The rules the answers say are broken with at least `minConfidence`, surest first. Missing answers break nothing. */
export function decide(answers: Record<string, Answer>, rules: readonly Rule[], minConfidence: number): Broken[] {
  const out: Broken[] = []
  rules.forEach((rule, i) => {
    const a = answers[questionId(i)]
    if (a?.type === 'noul' && a.noul >= minConfidence) out.push({ rule, p: a.noul })
  })
  return out.sort((x, y) => y.p - x.p)
}

export const TAG = 'jev-mod rules gate'

/** What the model reads when the edit is refused: each rule it broke, quoted with its file, and what to do. */
export function refusal(rel: string, broken: readonly Broken[]): string {
  const lines = broken.map(({ rule }) => `- "${rule.text}" (${rule.source}${rule.heading ? `, under "${rule.heading}"` : ''})`)
  const one = broken.length === 1
  return [
    `${TAG}: this edit to ${rel} was not made. It looks like it breaks ${one ? 'a rule' : `${broken.length} rules`} this project's agents are given:`,
    ...lines,
    `Change the edit so it keeps to ${one ? 'the rule' : 'these rules'} and try again, or, if ${one ? 'it should' : 'one should'} not apply here, `
      + 'tell the person which rule and why, and leave the decision to them.',
  ].join('\n')
}
