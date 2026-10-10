import { noul, type Answer, type Question } from '../../engine/client'

// review-triage's rules, with no IO: which git command reads the change, how a diff splits into
// files and hunks, what is sent (capped, redacted, secrets left out), the (up to) seven questions, the
// verdict, which files drove it, and the text the model reads.

// ── reading the change ───────────────────────────────────────────────────────

/** git diff's flags: plain text, no external differ, renames found, three lines of context. */
export const DIFF_FLAGS = ['--no-color', '--no-ext-diff', '--find-renames', '-U3'] as const
/** At most this many `paths` are passed to git. */
export const MAX_PATHS = 50

/** A ref or a range git can diff against; never an option, never whitespace. */
export function validRef(ref: string): boolean {
  return ref.length > 0 && ref.length <= 200 && !ref.startsWith('-') && /^[A-Za-z0-9_./~^@{}:+-]+$/.test(ref)
    && !ref.includes('....')
}

/** A path inside the project, relative to its root, or null when it is outside or not a path. */
export function projectPath(root: string, given: string): string | null {
  let path = given.trim().replace(/\\/g, '/')
  if (!path || path.includes('\0')) return null
  const base = root.replace(/\/+$/, '')
  if (path.startsWith('/')) {
    if (path === base) return '.'
    if (!path.startsWith(`${base}/`)) return null
    path = path.slice(base.length + 1)
  }
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (!parts.length) return null; parts.pop(); continue }
    parts.push(part)
  }
  const out = parts.join('/') || '.'
  return out.startsWith('-') ? `./${out}` : out
}

/** git's empty tree: what the first commit of a repository is diffed against. */
export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

export type Source = { kind: 'uncommitted' } | { kind: 'last-commit'; root?: boolean } | { kind: 'base'; base: string; mergeBase: boolean }

/** The git command that reads the change from `source`, limited to `paths` (already checked). */
export function diffArgs(root: string, source: Source, paths: readonly string[]): string[] {
  const head = ['git', '-C', root, 'diff', ...DIFF_FLAGS]
  const tail = ['--', ...(paths.length ? paths : [])]
  if (source.kind === 'uncommitted') return [...head, 'HEAD', ...tail]
  if (source.kind === 'last-commit') return [...head, source.root ? EMPTY_TREE : 'HEAD~1', 'HEAD', ...tail]
  // a range (a..b, a...b) is git's own; a single ref is diffed from where this branch left it
  if (source.base.includes('..') || !source.mergeBase) return [...head, source.base, ...tail]
  return [...head, '--merge-base', source.base, ...tail]
}

/** The untracked files git would show (not ignored), limited to `paths`. */
export function untrackedArgs(root: string, paths: readonly string[]): string[] {
  return ['git', '-C', root, 'ls-files', '-o', '--exclude-standard', '-z', '--', ...paths]
}

export function describeSource(source: Source): string {
  if (source.kind === 'uncommitted') return 'uncommitted changes vs HEAD'
  if (source.kind === 'last-commit' && source.root) return 'the first commit, against the empty tree (no uncommitted changes)'
  if (source.kind === 'last-commit') return 'the last commit, HEAD~1..HEAD (no uncommitted changes)'
  return source.base.includes('..') ? source.base : `changes since ${source.base}`
}

// ── the diff, split ──────────────────────────────────────────────────────────

export type Hunk = { header: string; newStart: number; newLines: number; text: string; added: number; removed: number }
export type FileDiff = {
  path: string
  oldPath?: string
  status: 'added' | 'deleted' | 'modified' | 'renamed' | 'binary'
  hunks: Hunk[]
  added: number
  removed: number
  /** An untracked text file over the size read: counted, but its text is not here. */
  tooLarge?: boolean
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

function unquote(path: string): string {
  if (!path.startsWith('"')) return path
  try { return JSON.parse(path) as string } catch { return path.slice(1, -1) }
}

/** `git diff` output, one entry per file, its hunks split out and counted. */
export function parseDiff(text: string): FileDiff[] {
  const files: FileDiff[] = []
  let file: FileDiff | null = null
  let hunk: Hunk | null = null
  const closeHunk = () => {
    if (file && hunk) { file.hunks.push(hunk); file.added += hunk.added; file.removed += hunk.removed }
    hunk = null
  }
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      closeHunk()
      const m = /^diff --git ("?a\/.*?"?) ("?b\/.*"?)$/.exec(line)
      const b = m ? unquote(m[2]!).replace(/^b\//, '') : line.slice(11)
      file = { path: b, status: 'modified', hunks: [], added: 0, removed: 0 }
      files.push(file)
      continue
    }
    if (!file) continue
    const header = HUNK_HEADER.exec(line)
    if (header) {
      closeHunk()
      hunk = { header: line, newStart: Number(header[1]), newLines: header[2] === undefined ? 1 : Number(header[2]),
        text: line, added: 0, removed: 0 }
      continue
    }
    if (hunk) {
      if (line.startsWith('+')) hunk.added++
      else if (line.startsWith('-')) hunk.removed++
      else if (!line.startsWith(' ') && !line.startsWith('\\') && line !== '') { closeHunk(); }
      if (hunk) { hunk.text += `\n${line}`; continue }
    }
    if (line.startsWith('new file mode')) file.status = 'added'
    else if (line.startsWith('deleted file mode')) file.status = 'deleted'
    else if (line.startsWith('rename from ')) { file.oldPath = line.slice(12); file.status = 'renamed' }
    else if (line.startsWith('Binary files ') || line === 'GIT binary patch') file.status = 'binary'
  }
  closeHunk()
  for (const f of files) {
    // a trailing blank line of the output is not context
    for (const h of f.hunks) h.text = h.text.replace(/\n+$/, '')
  }
  return files
}

/** An untracked file as a diff that adds it whole; null text means a binary or unreadable one, `tooLarge` a text file too big to read. */
export function untrackedDiff(path: string, text: string | null, tooLarge = false): FileDiff {
  if (tooLarge) return { path, status: 'added', hunks: [], added: 0, removed: 0, tooLarge: true }
  if (text === null || text.includes('\0')) return { path, status: 'binary', hunks: [], added: 0, removed: 0 }
  const lines = text.replace(/\n$/, '').split('\n')
  const n = text ? lines.length : 0
  const header = `@@ -0,0 +1,${n} @@`
  const hunks = n ? [{ header, newStart: 1, newLines: n, text: [header, ...lines.map(l => `+${l}`)].join('\n'), added: n, removed: 0 }] : []
  return { path, status: 'added', hunks, added: n, removed: 0 }
}

export type Stats = { files: number; added: number; removed: number; chars: number }

export function statsOf(files: readonly FileDiff[]): Stats {
  return {
    files: files.length,
    added: files.reduce((s, f) => s + f.added, 0),
    removed: files.reduce((s, f) => s + f.removed, 0),
    chars: files.reduce((s, f) => s + f.hunks.reduce((t, h) => t + h.text.length, 0), 0),
  }
}

/** Where a hunk lands in the new file, as a reader looks it up. */
export function linesOf(h: Hunk): string {
  if (h.newLines === 0) return `near line ${h.newStart}`
  return h.newLines === 1 ? `line ${h.newStart}` : `lines ${h.newStart}-${h.newStart + h.newLines - 1}`
}

// ── what is sent ─────────────────────────────────────────────────────────────

/** Past this many times maxDiffChars, or this many files, the change is not triaged. */
export const HARD_CAP_FACTOR = 10
export const MAX_FILES = 300
/** A hunk trimmed below this many characters says too little to be worth its place. */
export const MIN_HUNK_CHARS = 160
/** Less than this share of the changed lines left after secrets are taken out is not enough. */
export const MIN_SENT_SHARE = 0.5

export type Withheld = { path: string; lines: string }
export type Summary = {
  /** The files as sent: F1.. in the order of `files`. */
  sent: { id: string; file: FileDiff; text: string }[]
  /** Hunks (or whole files, by path) not sent because they look like they hold a secret. */
  withheld: Withheld[]
  /** Hunks trimmed, or hunks and files left out (not shown at all), to fit maxDiffChars. */
  trimmed: number
  omitted: number
  /** The share of changed lines that could be sent at all (secrets aside). */
  sendableShare: number
}

/** The largest per-hunk cap at which every hunk, each cut to it, fits `budget` (water-filling). */
export function hunkCap(lengths: readonly number[], budget: number): number {
  const total = lengths.reduce((s, n) => s + n, 0)
  if (total <= budget) return Infinity
  let lo = 0
  let hi = Math.max(0, ...lengths)
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (lengths.reduce((s, n) => s + Math.min(n, mid), 0) <= budget) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** A hunk cut at a line boundary to `cap` characters, saying how many lines were left out. */
export function trimHunk(text: string, cap: number): string {
  if (text.length <= cap) return text
  const lines = text.split('\n')
  const kept: string[] = []
  let used = 0
  for (const line of lines) {
    const cost = line.length + 1
    if (kept.length && used + cost > cap) break
    kept.push(line.length > cap ? `${line.slice(0, cap)}…` : line)
    used += cost
  }
  return `${kept.join('\n')}\n… (${lines.length - kept.length} more lines not sent)`
}

/**
 * The diff as the decision model may see it: hunks that look like they hold a secret left out
 * (a file whose path does, whole), the rest redacted and cut to fit `maxChars` (hunks longer than a common cap are
 * cut to it and shorter ones stay whole; when even the shortest useful cut does not fit, the later hunks
 * are left out, and an untracked file too large to read is left out too: both count as `omitted`).
 */
export function summarize(files: readonly FileDiff[], maxChars: number, sensitive: (text: string) => boolean,
  redact: (text: string) => string): Summary {
  const withheld: Withheld[] = []
  const keep: { file: FileDiff; hunks: string[] }[] = []
  let total = 0
  let sendable = 0
  for (const file of files) {
    const lines = file.added + file.removed
    total += lines
    if (sensitive(file.path) || (file.oldPath && sensitive(file.oldPath))) {
      withheld.push({ path: file.path, lines: 'the whole file' })
      continue
    }
    const hunks: string[] = []
    for (const h of file.hunks) {
      if (sensitive(h.text)) withheld.push({ path: file.path, lines: linesOf(h) })
      else { hunks.push(redact(h.text)); sendable += h.added + h.removed }
    }
    keep.push({ file, hunks })
  }
  const all = keep.flatMap(k => k.hunks)
  let cap = hunkCap(all.map(h => h.length), maxChars)
  let room = Infinity
  if (cap < MIN_HUNK_CHARS && all.length) { cap = MIN_HUNK_CHARS; room = maxChars }
  let trimmed = 0
  let omitted = 0
  const sent = keep.map((k, i) => {
    const parts: string[] = []
    for (const h of k.hunks) {
      if (room <= 0) { omitted++; continue }
      const cut = trimHunk(h, cap)
      if (cut.length > room) { omitted++; room = 0; continue }
      if (cut !== h) trimmed++
      parts.push(cut)
      if (room !== Infinity) room -= cut.length
    }
    if (k.file.tooLarge) { omitted++; parts.push('(too large, not shown)') }
    else if (!k.hunks.length && k.file.status === 'binary') parts.push('(binary file)')
    if (!k.file.tooLarge && !k.hunks.length && !k.file.hunks.length && k.file.status !== 'binary') parts.push(`(${k.file.status}, no content lines)`)
    return { id: `F${i + 1}`, file: k.file, text: parts.join('\n') }
  })
  return { sent, withheld, trimmed, omitted, sendableShare: total ? sendable / total : sent.length ? 1 : 0 }
}

// ── the project's written rules ──────────────────────────────────────────────

export const RULE_FILES = ['CLAUDE.md', 'AGENTS.md', '.claude/CLAUDE.md'] as const
export const MAX_RULES = 40
export const MAX_RULE_CHARS = 3000
const RULE_WORDS = /\b(must|never|always|do not|don't|dont|should|shall|only|avoid|prefer|required?|forbidden|no longer)\b/i

/** The lines of a CLAUDE.md or AGENTS.md that state a rule: list items, or lines with a rule's words. */
export function rulesIn(text: string): string[] {
  const out: string[] = []
  let fenced = false
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('```')) { fenced = !fenced; continue }
    if (fenced || !line || line.startsWith('#') || line.startsWith('|') || line.startsWith('<')) continue
    const item = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line)
    const body = (item ? item[1]! : line).replace(/\s+/g, ' ').trim()
    if (body.length < 8) continue
    if (item || RULE_WORDS.test(body)) out.push(body.length > 300 ? `${body.slice(0, 297)}...` : body)
  }
  return out
}

/** The rules from every file, unique, those with a rule's words first, capped by count and size. */
export function capRules(rules: readonly string[]): string[] {
  const unique = [...new Set(rules)]
  const ordered = [...unique.filter(r => RULE_WORDS.test(r)), ...unique.filter(r => !RULE_WORDS.test(r))]
  const out: string[] = []
  let used = 0
  for (const rule of ordered) {
    if (out.length >= MAX_RULES || used + rule.length > MAX_RULE_CHARS) break
    out.push(rule)
    used += rule.length
  }
  return out
}

// ── the questions ────────────────────────────────────────────────────────────

export type QuestionId = 'security' | 'data' | 'interface' | 'runtime' | 'rules' | 'tests' | 'scope'
export const QUESTION_IDS: readonly QuestionId[] = ['security', 'data', 'interface', 'runtime', 'rules', 'tests', 'scope']

/** How each question reads in the answer the model gets. */
export const LABELS: Record<QuestionId, string> = {
  security: 'security-sensitive code (auth, permissions, secrets)',
  data: 'hard-to-undo data handling (schemas, migrations, deletion, persistence)',
  interface: 'a public interface or behaviour others rely on',
  runtime: 'concurrency, shared state, caching or error handling that could fail only at runtime',
  rules: "a rule in the project's CLAUDE.md / AGENTS.md",
  tests: 'behaviour changed without a test that covers it',
  scope: 'more than the stated intent',
}
const SCOPE_UNSTATED = 'looks unfinished or inconsistent'

export function labelOf(id: QuestionId, hasIntent: boolean): string {
  return id === 'scope' && !hasIntent ? SCOPE_UNSTATED : LABELS[id]
}

/** The text of each question about `subject` ("the change", or "the change to file F2"). */
function texts(subject: string, hasIntent: boolean): Record<QuestionId, Question> {
  return {
    security: noul(`Does ${subject} touch authentication, authorization, permissions, secrets or other security-sensitive code?`, {
      true: 'it adds, removes or alters code that decides who may do what, handles credentials, tokens, keys or crypto, validates input at a trust boundary, or sandboxes something',
      false: 'none of the changed lines are security-sensitive',
    }),
    data: noul(`Does ${subject} change data handling that is hard to undo: schemas, migrations, deletion, or persistence formats?`, {
      true: 'it alters what is stored or how (a schema, a migration, a file or wire format that is written), or deletes data',
      false: 'stored data and its formats are untouched',
    }),
    interface: noul(`Does ${subject} change a public interface or behaviour other code or users rely on: an API, CLI flags, config keys, file formats, exported names?`, {
      true: 'a caller, user or other program could notice the difference',
      false: 'only internals change, or the interface is new and nothing relies on it yet',
    }),
    runtime: noul(`Does ${subject} touch concurrency, shared state, caching or error handling in a way that could fail only at runtime?`, {
      true: 'it alters locking, async ordering, shared or global state, a cache, retries, or what happens when something fails',
      false: 'none of those are touched',
    }),
    rules: noul(`Does ${subject} break any rule in project_rules (the rules written in the project's CLAUDE.md or AGENTS.md)?`, {
      true: 'a changed line does something a listed rule forbids, or leaves out something a listed rule requires',
      false: 'no listed rule is broken by the changed lines',
    }),
    tests: noul(`Does ${subject} change behaviour without a test in the diff that covers that change?`, {
      true: 'behaviour changes and no added or updated test exercises it',
      false: 'no behaviour changes (docs, comments, formatting, renames), or the diff adds or updates tests that cover it',
    }),
    scope: hasIntent
      ? noul(`Does ${subject} do more than intent describes, or something intent did not ask for?`, {
        true: 'there are changes the stated intent does not call for',
        false: 'every change serves the stated intent',
      })
      : noul(`Does ${subject} look unfinished or inconsistent: stubs, leftover TODOs or debug code, half-done renames, code paths that no longer agree?`, {
        true: 'something in it looks unfinished or inconsistent',
        false: 'it looks complete and consistent',
      }),
  }
}

/** The questions about the whole change: up to seven (`rules` only when the project wrote some; `scope` reads "unfinished or inconsistent" without an intent). */
export function questionsOf(hasIntent: boolean, hasRules: boolean): Record<string, Question> {
  const all = texts('the change in diff', hasIntent)
  return Object.fromEntries(QUESTION_IDS.filter(id => id !== 'rules' || hasRules).map(id => [id, all[id]]))
}

/** The most questions one follow-up request asks (flagged questions times files). */
export const MAX_FOLLOW_UP = 40

/**
 * The follow-up: each flagged question asked of each of the largest sent files, so the answer can
 * name the files behind it. Ids are `<question>__F<n>`.
 */
export function followUpOf(flagged: readonly QuestionId[], sent: Summary['sent'], hasIntent: boolean): Record<string, Question> {
  if (!flagged.length) return {}
  const perFile = Math.max(1, Math.floor(MAX_FOLLOW_UP / flagged.length))
  const files = sent.filter(s => s.file.hunks.length || s.file.status === 'binary')
    .sort((a, b) => (b.file.added + b.file.removed) - (a.file.added + a.file.removed)).slice(0, perFile)
  const out: Record<string, Question> = {}
  for (const s of files) {
    const asked = texts(`the change to file ${s.id} (${s.file.path}) in diff`, hasIntent)
    for (const id of flagged) out[`${id}__${s.id}`] = asked[id]
  }
  return out
}

// ── the verdict ──────────────────────────────────────────────────────────────

export type Reading = 'yes' | 'no' | 'unsure'

/** A yes needs minConfidence of yes, a no minConfidence of no; anything between is unsure. */
export function reading(pYes: number, minConfidence: number): Reading {
  if (pYes >= minConfidence) return 'yes'
  if (1 - pYes >= minConfidence) return 'no'
  return 'unsure'
}

export type Flag = { id: QuestionId; reading: Exclude<Reading, 'no'>; p: number }
export type Decision = { verdict: 'quick' | 'full'; flags: Flag[] }

const pOf = (answer: Answer | undefined): number | null => answer?.type === 'noul' ? answer.noul : null

/** quick only when every asked question is a confident no; a missing answer counts as unsure. */
export function decide(answers: Record<string, Answer>, asked: readonly string[], minConfidence: number): Decision {
  const flags: Flag[] = []
  for (const id of asked as QuestionId[]) {
    const p = pOf(answers[id])
    if (p === null) { flags.push({ id, reading: 'unsure', p: 0.5 }); continue }
    const r = reading(p, minConfidence)
    if (r !== 'no') flags.push({ id, reading: r, p })
  }
  // yes before unsure, the surest first
  flags.sort((a, b) => (a.reading === b.reading ? b.p - a.p : a.reading === 'yes' ? -1 : 1))
  return { verdict: flags.length ? 'full' : 'quick', flags }
}

/**
 * The files behind each flagged question, from the follow-up's answers: those at 0.5 or more,
 * surest first; when none reaches it, the one most likely (if any is above 0.2).
 */
export function attribute(answers: Record<string, Answer>, flags: readonly Flag[], sent: Summary['sent']): Map<QuestionId, FileDiff[]> {
  const out = new Map<QuestionId, FileDiff[]>()
  for (const flag of flags) {
    const scored = sent.map(s => ({ s, p: pOf(answers[`${flag.id}__${s.id}`]) }))
      .filter((x): x is { s: typeof x.s; p: number } => x.p !== null).sort((a, b) => b.p - a.p)
    const hit = scored.filter(x => x.p >= 0.5)
    const pick = hit.length ? hit : scored.length && scored[0]!.p > 0.2 ? [scored[0]!] : []
    if (pick.length) out.set(flag.id, pick.map(x => x.s.file))
  }
  return out
}

// ── the answer ───────────────────────────────────────────────────────────────

export const QUICK = 'one review pass is enough'
export const FULL = 'do the full review; start with these files'
export const MAX_LOOK_FIRST = 8

export type Outcome = {
  verdict: 'quick' | 'full'
  source: string
  stats: Stats
  files: readonly FileDiff[]
  /** Why: flagged questions, or why triage could not decide. */
  flags?: readonly Flag[]
  attributed?: ReadonlyMap<QuestionId, readonly FileDiff[]>
  hasIntent?: boolean
  /** Reasons that are not a question's answer (could not decide, a secret withheld, too large). */
  notes?: readonly string[]
  withheld?: readonly Withheld[]
  /** Questions left out, and why. */
  skipped?: readonly string[]
  minConfidence?: number
  /** How it was decided: "the decision model (2 requests)", or why it was not asked. */
  by: string
  trimmed?: boolean
}

function where(file: FileDiff): string {
  const ranges = file.hunks.slice(0, 3).map(linesOf)
  const more = file.hunks.length > 3 ? `, +${file.hunks.length - 3} more` : ''
  return ranges.length ? `${file.path} (${ranges.join(', ')}${more})` : `${file.path} (${file.status})`
}

/** The files to read first: those behind yes answers, then unsure ones, then withheld parts, then the largest. */
export function lookFirst(o: Outcome): string[] {
  const order: string[] = []
  const add = (path: string) => { if (!order.includes(path)) order.push(path) }
  for (const reading of ['yes', 'unsure'] as const) {
    for (const flag of o.flags ?? []) if (flag.reading === reading) for (const f of o.attributed?.get(flag.id) ?? []) add(f.path)
  }
  for (const w of o.withheld ?? []) add(w.path)
  for (const f of [...o.files].sort((a, b) => (b.added + b.removed) - (a.added + a.removed))) add(f.path)
  return order.slice(0, MAX_LOOK_FIRST)
}

/** The answer the model reads: the verdict and what to do first, then why, then the diff's size. */
export function render(o: Outcome): string {
  const lines = [`verdict: ${o.verdict}`, o.verdict === 'quick' ? `${QUICK}.` : `${FULL}.`]
  const reasons: string[] = []
  for (const flag of o.flags ?? []) {
    const files = o.attributed?.get(flag.id)
    reasons.push(`- ${labelOf(flag.id, o.hasIntent ?? false)} (${flag.reading}, p=${flag.p.toFixed(2)})${files?.length ? `: ${files.map(where).join('; ')}` : ''}`)
  }
  for (const note of o.notes ?? []) reasons.push(`- ${note}`)
  if (o.withheld?.length) {
    reasons.push(`- not sent, looks like it holds or handles a secret (check it yourself): ${o.withheld.map(w => `${w.path} (${w.lines})`).join('; ')}`)
  }
  if (o.verdict === 'quick') {
    const n = QUESTION_IDS.length - (o.skipped?.length ?? 0)
    reasons.unshift(`- all ${n} questions answered no with confidence >= ${o.minConfidence ?? 0.8}`)
  }
  if (reasons.length) lines.push('reasons:', ...reasons)
  if (o.verdict === 'full' && o.files.length) lines.push(`look first: ${lookFirst(o).join(', ')}`)
  for (const s of o.skipped ?? []) lines.push(`not asked: ${s}`)
  const s = o.stats
  lines.push(`diff: ${s.files} file${s.files === 1 ? '' : 's'}, +${s.added} -${s.removed} (${o.source})${o.trimmed ? '; trimmed to fit before it was sent' : ''}`)
  lines.push(`triaged by ${o.by}. This only sets how deep the first review pass goes; it never replaces the review.`)
  return lines.join('\n')
}
