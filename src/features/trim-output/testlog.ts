// Test logs, for output trimming: plain functions, no IO.
//
// When a command's output is recognisably a test runner's, it is split into blocks: passing
// tests, other test output (banners, console output, warnings), failures, and the summary.
// Failures and the summary are always kept and never sent to the decision model; the other
// blocks are asked about, in one request, against the current goal (see index.ts).
//
// Detection is conservative: the output must carry the runner's own summary line, and the
// command must name the runner or be a plain test command (npm test, make test, ...).
// A command that only reads a log (cat, grep, tail, ...) is never taken for a test run.

import { HEAD_LINES, TAIL_LINES, MIN_CHUNK_LINES, CHUNK_LINES, STATE_BUDGET, MAX_SENT_CHUNKS, type Chunk, type Row } from './trim'

export type Runner = 'vitest' | 'jest' | 'pytest' | 'go' | 'cargo' | 'bun' | 'node' | 'mocha'
export type BlockKind = 'pass' | 'other' | 'fail' | 'summary'

/** Line indexes [start, end] (0-based, inclusive). A failure has its test's name when the runner gives one. */
export type Block = { kind: BlockKind; start: number; end: number; name?: string }
export type TestLog = { runner: Runner; blocks: Block[] }

/** The decision model must be this sure a block is not needed before it is dropped. */
export const NOT_NEEDED = 0.9

type Spec = {
  command: RegExp
  /** A line only this runner prints, at the end of a run: what proves the runner. */
  proof: RegExp
  pass: RegExp
  /** From the first line like this, the rest of the output is the summary. */
  tail?: RegExp
  /** A line that is summary by itself. */
  summaryLine?: RegExp
  /** A failure's name, when this line starts its block. */
  failStart: (line: string) => string | null
  /** Failures start only after the first line like this. */
  armAfter?: RegExp
  /** A line that ends the failure block before it. */
  failEnd?: RegExp
}

const capture = (re: RegExp) => (line: string) => re.exec(line)?.[1] ?? null

const SPECS: Record<Runner, Spec> = {
  vitest: {
    command: /\bvitest\b/, proof: /^\s*Test Files\s+.*\d/, pass: /^\s*[✓✔√]\s/, tail: /^\s*Test Files\s/,
    failStart: capture(/^\s*FAIL\s+(\S.*?)\s*$/),
  },
  jest: {
    command: /\bjest\b/, proof: /^Tests:\s+.*\d/, pass: /^\s*[✓✔√]\s|^PASS\s/, tail: /^Test Suites:\s/,
    failStart: capture(/^\s*●\s+(?!Console\b)(\S.*?)\s*$/),
  },
  pytest: {
    command: /\bpy\.?test\b/,
    proof: /^=*\s*(\d+ (passed|failed|errors?|skipped|xfailed|xpassed|deselected|warnings?)[, ]*)+.* in [\d.]+s/,
    pass: /^\S+::\S+.*\bPASSED\b|^\S+\.py\s+[.sxX]+\s*(\[\s*\d+%\])?\s*$/,
    tail: /^(=+ short test summary info =+|=*\s*(\d+ (passed|failed|errors?|skipped|xfailed|xpassed|deselected|warnings?)[, ]*)+.* in [\d.]+s.*)$/,
    failStart: capture(/^_{2,}\s+(.+?)\s+_{2,}$/), failEnd: /^={3,}/,
  },
  go: {
    command: /\bgo\s+test\b/, proof: /^(ok|FAIL)\s+\S+\s+(\(cached\)|[\d.]+s)/,
    pass: /^(=== (RUN|PAUSE|CONT|NAME)\s|\s*--- (PASS|SKIP):)/, summaryLine: /^(ok|FAIL|PASS|\?)(\s|$)/,
    failStart: capture(/^--- FAIL:\s+(\S+)/), failEnd: /^\S/,
  },
  cargo: {
    command: /\bcargo\s+test\b/, proof: /^test result: (ok|FAILED)\./, pass: /^test \S+ \.\.\. (ok|ignored)\b/,
    summaryLine: /^test result:/, failStart: capture(/^---- (\S+) stdout ----$/), failEnd: /^(failures:|test result:)/,
  },
  bun: {
    command: /\bbun\s+test\b/, proof: /^Ran \d+ tests? across \d+ files?/, pass: /^(\(pass\)|[✓✔]\s)/,
    tail: /^\s*\d+ pass\s*$/, failStart: () => null,
  },
  node: {
    command: /\bnode\b.*--test\b/, proof: /^(# tests \d+|ℹ tests \d+)/, pass: /^\s*(ok \d+ |[✔✓]\s)/,
    tail: /^(# tests \d+|ℹ tests \d+)/, failStart: capture(/^\s*not ok \d+ - (.+?)\s*$/), failEnd: /^\S/,
  },
  mocha: {
    command: /\bmocha\b/, proof: /^\s*\d+ passing\b/, pass: /^\s*[✓✔]\s/, summaryLine: /^\s*\d+ (passing|failing|pending)\b/,
    armAfter: /^\s*\d+ failing\b/, failStart: capture(/^\s{2}\d+\) (.+?)\s*$/),
  },
}

// A command that is a test command whatever runner the package script uses.
const GENERIC = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bnpx\s+\S*test|\bmake\s+(\S+\s+)?test|\b(tox|nox)\b|\bpython3?\s+-m\s+(pytest|unittest)\b/
// A command that shows a file or filters text is not a test run, whatever it mentions.
const READS = /^\s*(cat|less|more|head|tail|grep|egrep|rg|sed|awk|echo|printf|ls|wc|diff|git|find)\b/

// Lines in a block that were not asked about because they hold a failure, an error or a stack frame.
const FAILISH = /[✗✘×❌✖]|\bnot ok\b|\bERR!|\b(FAIL|FAILED|FAILURES?|failed|failing|failures?)\b|\bpanicked\b|\(fail\)|^\s*error:|\b\w*(Error|Exception)\b|\bAssertion|^\s*(E|F)\s{2,}\S|^\s*at\s+\S|^\s*\S+\.(ts|js|py|go|rs|tsx|jsx):\d+|^\S+\.py\s+[.sxX]*[FE]/

/** The runner whose output this is, or null when it is not clearly a test run. */
export function detect(lines: readonly string[], command: string): Runner | null {
  if (READS.test(command)) return null
  const generic = GENERIC.test(command)
  for (const runner of Object.keys(SPECS) as Runner[]) {
    const spec = SPECS[runner]
    if (!generic && !spec.command.test(command)) continue
    if (lines.some(l => spec.proof.test(l))) return runner
  }
  return null
}

/** The output split into blocks that cover every line. Null when it is not a test run's. */
export function parse(lines: readonly string[], command: string): TestLog | null {
  const runner = detect(lines, command)
  if (!runner) return null
  const spec = SPECS[runner]
  const n = lines.length
  const tail = spec.tail ? lines.findIndex(l => spec.tail!.test(l)) : -1
  const kinds: BlockKind[] = []
  const owner: number[] = [] // which failure block a line belongs to, 0 for none
  const names: string[] = []
  let armed = !spec.armAfter
  let current = 0
  for (let i = 0; i < n; i++) {
    const line = lines[i]!
    owner.push(0)
    if (i < HEAD_LINES || i >= n - TAIL_LINES || (tail >= 0 && i >= tail) || spec.summaryLine?.test(line)) {
      current = 0
      if (!armed && spec.armAfter!.test(line)) armed = true
      kinds.push('summary')
      continue
    }
    const name = armed ? spec.failStart(line) : null
    if (name !== null) { names.push(name); current = names.length }
    else if (current && spec.failEnd?.test(line)) current = 0
    if (current) { kinds.push('fail'); owner[i] = current; continue }
    // a blank line ends what came before it; it is not noise of its own
    const before = kinds[i - 1]
    if (line.trim() === '') kinds.push(before === 'pass' ? 'pass' : 'other')
    else kinds.push(spec.pass.test(line) ? 'pass' : 'other')
  }
  // a heading of one or two lines between passing tests (a describe name, a file) belongs to them
  for (let i = 1; i < n; i++) {
    if (kinds[i] !== 'other' || kinds[i - 1] !== 'pass') continue
    let j = i
    while (j < n && kinds[j] === 'other' && j - i < 3) j++
    if (j - i > 2 || kinds[j] !== 'pass') continue
    const heading = lines.slice(i, j)
    if (heading.some(l => l.trim() === '' || FAILISH.test(l) || /\b(warn|deprecat)/i.test(l))) continue
    for (let k = i; k < j; k++) kinds[k] = 'pass'
  }
  const blocks: Block[] = []
  let open: Block | null = null
  for (let i = 0; i < n; i++) {
    const kind = kinds[i]!
    const size = open ? i - open.start : 0
    const same = open && open.kind === kind && (kind !== 'fail' || owner[i - 1] === owner[i])
    const full = open && (kind === 'pass' || kind === 'other') && size >= CHUNK_LINES
    const split = open && (kind === 'pass' || kind === 'other') && lines[i - 1]!.trim() === '' && size >= MIN_CHUNK_LINES
    if (open && same && !full && !split) { open.end = i; continue }
    open = { kind, start: i, end: i, ...(kind === 'fail' ? { name: names[owner[i]! - 1] } : {}) }
    blocks.push(open)
  }
  // an "other" block that holds a failure, an error or a stack frame is not noise to be judged
  for (const b of blocks) {
    if (b.kind === 'other' && lines.slice(b.start, b.end + 1).some(l => FAILISH.test(l))) b.kind = 'fail'
  }
  return { runner, blocks }
}

// ── failures remembered between runs ─────────────────────────────────────────

/** Durations differ between runs of the same failure; nothing else is changed. */
const DURATION = /\b\d+(\.\d+)?\s?(ms|µs|us|ns|s|sec|seconds?)\b/g

/** A 53-bit string hash (cyrb53): a failure's text is kept as this, not as text. */
export function hash(text: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** A command as one run of it is told from another: spacing ignored, kept as a hash. */
export const commandKey = (command: string): string => hash(command.trim().replace(/\s+/g, ' '))

export const MAX_COMMANDS = 20
export const MAX_FAILURES = 100

/** Each named failure's signature: its name (a repeated name is numbered) and a hash of its text. */
export function failures(lines: readonly string[], log: TestLog): { name: string; sig: string; block: Block }[] {
  const seen = new Map<string, number>()
  const out: { name: string; sig: string; block: Block }[] = []
  for (const b of log.blocks) {
    if (b.kind !== 'fail' || b.name === undefined) continue
    const count = (seen.get(b.name) ?? 0) + 1
    seen.set(b.name, count)
    const text = lines.slice(b.start, b.end + 1).map(l => l.replace(DURATION, '#t').trimEnd()).join('\n')
    out.push({ name: count > 1 ? `${b.name} #${count}` : b.name, sig: hash(text), block: b })
  }
  return out
}

/** What a run leaves for the next one to compare with: failure name -> signature, bounded. */
export function remembered(lines: readonly string[], log: TestLog): Record<string, string> {
  return Object.fromEntries(failures(lines, log).slice(0, MAX_FAILURES).map(f => [f.name, f.sig]))
}

export type Same = { start: number; end: number; names: string[] }

/** The line ranges of failures identical to the previous run's, neighbours joined; names listed for the marker. */
export function unchanged(lines: readonly string[], log: TestLog, previous: Readonly<Record<string, string>>): Same[] {
  const out: Same[] = []
  for (const f of failures(lines, log)) {
    if (previous[f.name] !== f.sig) continue
    const last = out[out.length - 1]
    if (last && last.end + 1 === f.block.start) { last.end = f.block.end; last.names.push(f.name) }
    else out.push({ start: f.block.start, end: f.block.end, names: [f.name] })
  }
  return out
}

/** The names in a marker: the first few, then a count. */
export function nameList(names: readonly string[]): string {
  const shown = names.slice(0, 8).map(n => (n.length > 120 ? `${n.slice(0, 120)}…` : n))
  return names.length > shown.length ? `${shown.join(', ')} and ${names.length - shown.length} more` : shown.join(', ')
}

// ── chunks and the judgement ─────────────────────────────────────────────────

/**
 * The decision model's units for a test log: the rows of each block. A failure or the summary
 * is kept, and so is a "still failing" marker. The generic "holds a protected word" test is not used,
 * because a passing test may well be called "rejects an error".
 */
export function chunks(rows: readonly Row[], log: TestLog): Chunk[] {
  const blockOf = (line: number) => {
    let lo = 0, hi = log.blocks.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (log.blocks[mid]!.end < line - 1) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const out: Chunk[] = []
  let last = -1
  rows.forEach((r, i) => {
    const b = blockOf(r.from)
    const markers = r.kind === 'same'
    if (b === last) {
      const c = out[out.length - 1]!
      c.end = i
      c.keep = c.keep && (markers || log.blocks[b]!.kind === 'fail' || log.blocks[b]!.kind === 'summary')
    } else {
      const kind = log.blocks[b]!.kind
      out.push({ start: i, end: i, keep: markers || kind === 'fail' || kind === 'summary' })
      last = b
    }
  })
  return out
}

/** The ids to ask about in the one request: in order, as many as fit its budget. The rest are kept. */
export function oneRequest(texts: ReadonlyMap<number, string>, cost: (text: string) => number): number[] {
  const ids: number[] = []
  let used = 0
  for (const [id, text] of texts) {
    used += cost(text)
    if (ids.length >= MAX_SENT_CHUNKS || used > STATE_BUDGET) break
    ids.push(id)
  }
  return ids
}

/** The chunk -> probability map a drop() with a 0.5 threshold needs: 0 where "not needed" is sure enough, else 1. */
export function dropOnly(need: ReadonlyMap<number, number>): Map<number, number> {
  return new Map([...need].map(([id, p]) => [id, 1 - p >= NOT_NEEDED - 1e-9 ? 0 : 1]))
}
