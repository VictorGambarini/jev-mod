// Output trimming's rules: plain functions, no IO, so the test kit can hold them to their word.
//
// A long Bash output goes through two steps before the model reads it:
//
//   1. fold (local, sends nothing): a run of identical lines becomes one line and
//      "(repeated N times)"; a run of lines that differ only in numbers, hashes or timestamps
//      keeps its first and last line and a marker for the ones between. Lines that carry an
//      error, a warning, a failure, a stack frame or a summary are never folded into a marker,
//      and neither are the first and last lines of the output.
//   2. drop (the decision model): what is still long is cut into chunks at blank lines and
//      section headers, and the decision model says how likely the current goal still needs
//      each. A chunk under the threshold is replaced by a marker naming the lines it stood for
//      in the archived full output. A chunk holding a protected line is never sent or dropped.
//
// Every marker names the original line numbers, so the model can read exactly what was cut.

import { noul, type Question } from '../../engine/client'
import { redact } from '../../engine/privacy'
import { encode } from '../../engine/pyjson'

export const HEAD_LINES = 2
export const TAIL_LINES = 5
export const MIN_SIMILAR_RUN = 3
export const CHUNK_LINES = 40
export const MIN_CHUNK_LINES = 8
export const CHUNK_CHARS = 1200
export const GOAL_CHARS = 1500
export const COMMAND_CHARS = 500
// As compact.ts: requests are packed by encoded size, not by count, with room for the questions.
export const STATE_BUDGET = 40_000
export const BATCH = 40
export const MAX_SENT_CHUNKS = 120
const PER_CHUNK_OVERHEAD = 16

// ── protected lines ──────────────────────────────────────────────────────────

// stack frames: JS, Python, Go/Rust/Java and file:line references
const STACK: RegExp[] = [
  /^\s+at\s+\S/,
  /^\s*File "[^"]+", line \d+/,
  /^\s*\S+\.(js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|kt|rb|php|c|cc|cpp|h|cs|swift):\d+(:\d+)?\b/,
  /^\s*#\d+\s+0x[0-9a-f]+/i,
]

const PROTECTED: RegExp[] = [
  // errors, warnings, failures
  /\bERR!/,
  /\b(errors?|fatal|panic(ked)?|exception|traceback|fail(s|ed|ure|ures|ing)?|warn(ing|ings)?|abort(ed)?|segmentation fault|core dumped|denied|refused|timed out|timeout|undefined reference|cannot|unable to|not found|no such file)\b/i,
  /^\s*(E|F)\s{2,}\S/, // pytest's E/F detail lines
  /[✗✘×❌]/u,
  /\bnot ok\b/,
  // assertions
  /\b(assert(ion)?(error)?|expected|received|actual)\b/i,
  ...STACK,
  // summaries and exit codes
  /\b\d+\s+(passed|failed|skipped|errors?|xfailed|xpassed|warnings?|pending|todo|broken)\b/i,
  /^\s*(Tests?|Test Files|Test Suites|Suites|Snapshots|Duration|Time):?\s+.*\d/,
  /^Ran \d+ tests?\b/,
  /\b(exit(ed)? (code|status)|return(ed)? code|Exit code)\s*:?\s*-?\d+/i,
  /^(OK|FAILED|PASSED|SUCCESS|BUILD (SUCCESSFUL|FAILED))\b/,
]

/** A line that is always kept as it is: an error, a warning, a failure, a stack frame, a summary. */
export function isProtected(line: string): boolean {
  return PROTECTED.some(re => re.test(line))
}

/** A line that marks a stack trace: such a chunk is never dropped (it is protected anyway). */
export function isStackFrame(line: string): boolean {
  return STACK.some(re => re.test(line))
}

// ── folding ──────────────────────────────────────────────────────────────────

/** A line's shape: numbers, hex hashes, ids and timestamps all read alike. */
export function shapeOf(line: string): string {
  return line
    .replace(/\b[0-9a-f]{7,}\b/gi, '#')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '#')
    .replace(/\d+([.:,]\d+)*/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * One line of what the model reads, and the original lines (1-based, inclusive) it stands for.
 *   line     an original line, as it was
 *   repeat   one line that came `count` times in a row
 *   similar  a marker for `count` lines of the same shape as the lines around it
 *   omitted  a marker for `count` lines the decision model judged not needed
 */
export type Row = {
  kind: 'line' | 'repeat' | 'similar' | 'omitted'
  text: string
  from: number
  to: number
  count: number
  /** Never folded away or dropped. */
  keep: boolean
}

const row = (kind: Row['kind'], text: string, from: number, to: number, keep: boolean): Row =>
  ({ kind, text, from, to, count: to - from + 1, keep })

/** The output's lines; a final newline does not make an empty last line. */
export function linesOf(text: string): string[] {
  const lines = text.split(/\r?\n/)
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Step 1: runs of repeated and similar lines folded. Pure, and sends nothing. */
export function fold(lines: readonly string[]): Row[] {
  const n = lines.length
  const pinned = (i: number) => i < HEAD_LINES || i >= n - TAIL_LINES
  const keep = lines.map((line, i) => pinned(i) || isProtected(line))
  const shapes = lines.map(shapeOf)
  const rows: Row[] = []
  let i = 0
  while (i < n) {
    if (pinned(i)) { rows.push(row('line', lines[i]!, i + 1, i + 1, true)); i++; continue }
    // a run of identical lines, protected or not
    let j = i
    while (j + 1 < n && !pinned(j + 1) && lines[j + 1] === lines[i]) j++
    if (j > i) {
      rows.push(lines[i]!.trim() === '' ? row('line', lines[i]!, i + 1, j + 1, false) : row('repeat', lines[i]!, i + 1, j + 1, keep[i]!))
      i = j + 1
      continue
    }
    // a run of lines of one shape; a protected line is never folded into a marker
    if (!keep[i]! && lines[i]!.trim() !== '') {
      while (j + 1 < n && !pinned(j + 1) && !keep[j + 1] && shapes[j + 1] === shapes[i]) j++
      if (j - i + 1 >= MIN_SIMILAR_RUN) {
        rows.push(row('line', lines[i]!, i + 1, i + 1, false))
        rows.push(row('similar', '', i + 2, j, false))
        rows.push(row('line', lines[j]!, j + 1, j + 1, false))
        i = j + 1
        continue
      }
    }
    rows.push(row('line', lines[i]!, i + 1, i + 1, keep[i]!))
    i++
  }
  return rows
}

// ── chunks ───────────────────────────────────────────────────────────────────

// Where a new part of a log starts: a rule, a heading, a test file or case.
const SECTION = /^\s*(={3,}|-{3,}|_{3,}|\*{3,}|#{1,6}\s|(PASS|FAIL|RUN|ok|not ok|---)\b|[✓✔√]\s|\S+\s+PASSED|\S+\s+FAILED)/u

/** Row indexes [start, end] (inclusive) of each chunk, and whether it holds a row that is kept. */
export type Chunk = { start: number; end: number; keep: boolean }

/**
 * Step 2's units: rows cut at blank lines and section headers, packed until they stand for at least
 * MIN_CHUNK_LINES original lines, and cut at CHUNK_LINES rows. The output's first and last lines are chunks of their own, so they keep only themselves.
 */
export function chunk(rows: readonly Row[]): Chunk[] {
  if (!rows.length) return []
  const total = rows[rows.length - 1]!.to
  const pinned = (r: Row) => r.from <= HEAD_LINES || r.to > total - TAIL_LINES
  const segments: { s: number; e: number; pinned: boolean }[] = []
  let start = 0
  rows.forEach((r, i) => {
    if (i === start) return
    const blank = r.kind === 'line' && r.text.trim() === ''
    if (blank || SECTION.test(r.text) || pinned(r) !== pinned(rows[i - 1]!)) {
      segments.push({ s: start, e: i - 1, pinned: pinned(rows[start]!) })
      start = i
    }
  })
  segments.push({ s: start, e: rows.length - 1, pinned: pinned(rows[start]!) })
  const chunks: Chunk[] = []
  let open = null as { s: number; e: number; pinned: boolean } | null
  const close = () => {
    if (!open) return
    for (let s = open.s; s <= open.e; s += CHUNK_LINES) {
      const e = Math.min(open.e, s + CHUNK_LINES - 1)
      chunks.push({ start: s, end: e, keep: open.pinned || rows.slice(s, e + 1).some(r => r.keep) })
    }
    open = null
  }
  for (const seg of segments) {
    // a chunk is big enough when it stands for MIN_CHUNK_LINES original lines: a folded run is a unit of its own
    if (open && (open.pinned || seg.pinned || rows[open.e]!.to - rows[open.s]!.from + 1 >= MIN_CHUNK_LINES)) close()
    open = open ? { ...open, e: seg.e } : { ...seg }
  }
  close()
  return chunks
}

/** A chunk's text as the decision model reads it: its rows, markers in short form, redacted and capped. */
export function chunkText(rows: readonly Row[], c: Chunk): string {
  const text = rows.slice(c.start, c.end + 1).map(r => render1(r, 'the full output')).join('\n')
  return redact(text, CHUNK_CHARS)
}

// ── asking ───────────────────────────────────────────────────────────────────

export const NEED = noul(
  'Does the current goal (the user\'s latest request, served by running this command) still need this part of the command\'s output to be read?',
  {
    true: 'It holds something the goal depends on: a result, a value, an error or its context, a path, a version, a changed line',
    false: 'Noise for this goal: progress, passing checks, banners, downloads, repeated or routine lines',
  },
)

/** Chunk ids grouped into requests that fit, by encoded size and not by count. */
export function pack(texts: ReadonlyMap<number, string>): number[][] {
  const batches: number[][] = []
  let current: number[] = []
  let used = 0
  for (const [id, text] of texts) {
    const cost = encode(text, { ensureAscii: true }).length + PER_CHUNK_OVERHEAD
    if (current.length && (current.length >= BATCH || used + cost > STATE_BUDGET)) {
      batches.push(current)
      current = []
      used = 0
    }
    current.push(id)
    used += cost
  }
  if (current.length) batches.push(current)
  return batches
}

/** One request's state and questions: the goal, the command, and the chunks, each asked alone. */
export function request(goal: string, command: string, texts: ReadonlyMap<number, string>, ids: readonly number[]):
  { state: Record<string, unknown>; questions: Record<string, Question> } {
  return {
    state: {
      goal: redact(goal || '(not known)', GOAL_CHARS),
      command: redact(command, COMMAND_CHARS),
      chunks: Object.fromEntries(ids.map(id => [`C${id}`, texts.get(id)!])),
    },
    questions: Object.fromEntries(ids.map(id => [`c${id}`, { ...NEED, instructions: `${NEED.instructions} (chunk C${id})` }])),
  }
}

// ── applying ─────────────────────────────────────────────────────────────────

/**
 * Step 2's result: each chunk the decision model judged under `threshold` (and that holds no
 * kept row) replaced, with its dropped neighbours, by one "omitted" marker. A chunk with no
 * answer is kept.
 */
export function drop(rows: readonly Row[], chunks: readonly Chunk[], need: ReadonlyMap<number, number>, threshold: number): Row[] {
  const out: Row[] = []
  let omitted: Row | null = null
  chunks.forEach((c, id) => {
    const p = need.get(id)
    const cut = !c.keep && p !== undefined && p < threshold
    if (cut) {
      const from = rows[c.start]!.from
      const to = rows[c.end]!.to
      omitted = omitted ? { ...omitted, to, count: to - omitted.from + 1 } : row('omitted', '', from, to, false)
      return
    }
    if (omitted) { out.push(omitted); omitted = null }
    out.push(...rows.slice(c.start, c.end + 1))
  })
  if (omitted) out.push(omitted)
  return out
}

function render1(r: Row, path: string): string {
  switch (r.kind) {
    case 'line': return r.text
    case 'repeat': return `${r.text}  (repeated ${r.count} times)`
    case 'similar': return `[jev-mod: ${r.count} similar line${r.count === 1 ? '' : 's'} folded — ${path} lines ${r.from}–${r.to}]`
    case 'omitted': return `[jev-mod: ${r.count} line${r.count === 1 ? '' : 's'} omitted — full output: ${path} lines ${r.from}–${r.to}]`
  }
}

/** The rows as the model reads them, under one line saying what was done and where the rest is. */
export function render(rows: readonly Row[], original: number, path: string): string {
  const body = rows.map(r => render1(r, path))
  return [`[jev-mod trimmed this output from ${original} to ${body.length} lines; the full output is in ${path}]`, ...body].join('\n')
}

/** What a plan saves: lines and characters, against the original. */
export function saved(original: string, rows: readonly Row[], path: string): { lines: number; chars: number } {
  const out = render(rows, linesOf(original).length, path)
  return { lines: linesOf(original).length - linesOf(out).length, chars: original.length - out.length }
}

/** Whether the rows changed anything worth a header: something folded or omitted. */
export function changed(rows: readonly Row[]): boolean {
  return rows.some(r => r.kind !== 'line' || r.count > 1)
}
