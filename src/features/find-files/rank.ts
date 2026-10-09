// find-files' rules: plain functions, no IO, so the test kit can hold them to their word.
//
// The model asks where the code that does something lives. Two steps answer it:
//
//   1. narrow (local, sends nothing): every file under the folder is scored by the query's
//      words (split, stemmed, camelCase and snake_case taken apart) in its path, in its first
//      lines (header comment, imports, the names it defines) and in how many of its lines
//      mention them. The best few dozen go on.
//   2. rank (the decision model): each of those is sent as a short card (path, header comment,
//      the names it defines, a few matching lines, redacted) and the decision model says
//      whether it implements what the query describes, is related, or is unrelated. Its answer
//      orders the list; the local score breaks ties and orders what it did not judge.

import { choice, type Answer, type Question } from '../../engine/client'
import { redact } from '../../engine/privacy'
import { encode } from '../../engine/pyjson'

export const HEAD_LINES = 40
export const MAX_TERMS = 16
export const CARD_CHARS = 700
export const HEADER_CHARS = 240
export const MAX_SYMBOLS = 14
export const MAX_MATCH_LINES = 3
export const MATCH_LINE_CHARS = 140
export const QUERY_CHARS = 500
// As compact.ts: requests are packed by encoded size, not by count, with room for the questions.
export const STATE_BUDGET = 40_000
export const BATCH = 40
const PER_CARD_OVERHEAD = 16

// ── what a file is ───────────────────────────────────────────────────────────

/** Folders a walk never enters (a git listing already leaves out what .gitignore names). */
export const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'vendor', 'target', 'out', 'coverage', '.next', '.nuxt', '.cache',
  '.venv', 'venv', '__pycache__', '.mypy_cache', '.pytest_cache', '.tox', '.gradle', '.idea', 'bower_components',
])

const BINARY = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'icns', 'webp', 'tif', 'tiff', 'psd', 'pdf', 'zip', 'gz', 'tgz', 'bz2',
  'xz', '7z', 'rar', 'jar', 'war', 'class', 'so', 'dylib', 'dll', 'exe', 'bin', 'o', 'a', 'obj', 'wasm', 'pyc',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'mov', 'avi', 'mkv', 'wav', 'flac', 'ogg', 'webm', 'sqlite',
  'db', 'parquet', 'pkl', 'npy', 'npz', 'h5', 'onnx', 'pt', 'ckpt', 'safetensors', 'dmg', 'iso', 'map',
])

const GENERATED = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum|uv\.lock)$|\.min\.(js|css)$/

/** Whether a listed file is worth scoring: text, written by a person. */
export function wanted(path: string): boolean {
  if (GENERATED.test(path)) return false
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 || !BINARY.has(name.slice(dot + 1).toLowerCase())
}

// ── words ────────────────────────────────────────────────────────────────────

const STOP = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'into', 'onto', 'where', 'which', 'what', 'when', 'who',
  'how', 'does', 'did', 'done', 'are', 'was', 'were', 'has', 'have', 'had', 'its', 'not', 'but', 'any', 'all', 'can',
  'code', 'file', 'files', 'find', 'function', 'functions', 'logic', 'part', 'thing', 'things', 'implement',
  'implements', 'implementation', 'handles', 'handle', 'handling', 'should', 'would', 'could', 'there', 'their',
  'them', 'then', 'than', 'some', 'each', 'every', 'about', 'like', 'just', 'only', 'also', 'one', 'our', 'your',
  'you', 'out', 'use', 'used', 'uses', 'using', 'get', 'gets', 'set', 'sets', 'make', 'makes', 'via', 'per',
])

/** A word's rough stem: plural and common suffixes off, never below three letters. */
export function stem(word: string): string {
  for (const suffix of ['ations', 'ation', 'ions', 'ion', 'ings', 'ing', 'ers', 'er', 'ies', 'ied', 'es', 'ed', 'ly', 's']) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
      const base = word.slice(0, -suffix.length)
      return suffix === 'ies' || suffix === 'ied' ? `${base}y` : base
    }
  }
  return word
}

/** An identifier or a phrase as lowercase words: camelCase, snake_case, kebab-case and paths taken apart. */
export function wordsOf(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** The query's words worth matching, stemmed, most telling first (longer before shorter), at most MAX_TERMS. */
export function termsOf(query: string): string[] {
  const seen = new Set<string>()
  for (const word of wordsOf(query)) {
    if (word.length < 3 || STOP.has(word) || /^\d+$/.test(word)) continue
    seen.add(stem(word))
  }
  return [...seen].sort((a, b) => b.length - a.length).slice(0, MAX_TERMS)
}

/** The stems a text holds. */
function stemsOf(text: string): Set<string> {
  return new Set(wordsOf(text).map(stem))
}

/** Whether a term is among the stems: equal, or one starts the other when both are long enough. */
function hit(term: string, stems: ReadonlySet<string>): boolean {
  if (stems.has(term)) return true
  if (term.length < 4) return false
  for (const s of stems) if (s.length >= 4 && (s.startsWith(term) || term.startsWith(s))) return true
  return false
}

/** How many of the terms the stems hold. */
export function hits(terms: readonly string[], stems: ReadonlySet<string>): number {
  return terms.filter(t => hit(t, stems)).length
}

// ── a file's head ────────────────────────────────────────────────────────────

export type Head = {
  /** The comment the file opens with, joined into one line. */
  header: string
  /** Names it defines or exports. */
  symbols: string[]
  /** What it imports. */
  imports: string[]
  /** Its first HEAD_LINES lines. */
  lines: string[]
}

const COMMENT = /^\s*(\/\/+!?|#+(?!!)|\/\*+|\*+\/?|--|;+|"""|''')\s?/
const SYMBOL = [
  /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\*?|class|const|let|var|type|interface|enum|namespace)\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/,
  /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:fn|struct|enum|trait|mod)\s+([A-Za-z_]\w*)/,
  /^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/,
  /^\s*(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:public|private|protected|internal)\s+(?:static\s+)?(?:final\s+)?(?:class|interface|enum|record)\s+([A-Za-z_]\w*)/,
]
const IMPORT = [
  /\bfrom\s+['"]([^'"]+)['"]/,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/,
  /^\s*import\s+['"]([^'"]+)['"]/,
  /^\s*from\s+([\w.]+)\s+import\b/,
  /^\s*import\s+([\w.]+)\s*$/,
  /^\s*use\s+([\w:]+)/,
]

/** What a file's first lines say about it. */
export function headOf(text: string): Head {
  const lines = text.split(/\r?\n/, HEAD_LINES)
  const header: string[] = []
  let opening = true
  const symbols: string[] = []
  const imports: string[] = []
  for (const [i, line] of lines.entries()) {
    if (opening) {
      if (i === 0 && line.startsWith('#!')) continue
      if (COMMENT.test(line)) {
        const words = line.replace(COMMENT, '').replace(/\*\/\s*$/, '').trim()
        if (words && !/^[-=*#/ ]+$/.test(words)) header.push(words)
        continue
      }
      if (line.trim() === '' && !header.length) continue
      if (line.trim() !== '' || header.length) opening = false
    }
    for (const pattern of SYMBOL) {
      const m = pattern.exec(line)
      if (m && !symbols.includes(m[1]!)) { symbols.push(m[1]!); break }
    }
    for (const pattern of IMPORT) {
      const m = pattern.exec(line)
      if (m) { imports.push(m[1]!); break }
    }
  }
  return { header: header.join(' ').slice(0, 2 * HEADER_CHARS), symbols: symbols.slice(0, MAX_SYMBOLS), imports, lines }
}

// ── the local score ──────────────────────────────────────────────────────────

/** The path's share: the file's own name counts more than the folders above it. */
export function pathScore(path: string, terms: readonly string[]): number {
  const slash = path.lastIndexOf('/')
  const name = stemsOf(path.slice(slash + 1).replace(/\.[^.]+$/, ''))
  const dirs = stemsOf(slash > 0 ? path.slice(0, slash) : '')
  return terms.reduce((sum, t) => sum + (hit(t, name) ? 3 : hit(t, dirs) ? 1.5 : 0), 0)
}

/** The head's share: its header comment and the names it defines count most, its imports less, the rest least. */
export function headScore(head: Head, terms: readonly string[]): number {
  if (!terms.length) return 0
  const header = stemsOf(head.header)
  const symbols = stemsOf(head.symbols.join(' '))
  const imports = stemsOf(head.imports.join(' '))
  const rest = stemsOf(head.lines.join(' '))
  return terms.reduce((sum, t) => sum + (hit(t, symbols) ? 2.5 : hit(t, header) ? 2 : hit(t, imports) ? 1 : hit(t, rest) ? 0.5 : 0), 0)
}

/** Lines anywhere in the file that mention a term (as git grep -c counts them): a little, with diminishing returns. */
export function bodyScore(matchingLines: number): number {
  return matchingLines > 0 ? Math.min(3, Math.sqrt(matchingLines) * 0.6) : 0
}

export type Candidate = { path: string; score: number; head?: Head }

/** The candidates, best first; ties by shorter path, then by name. */
export function byScore<T extends { path: string; score: number }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path))
}

// ── what is sent ─────────────────────────────────────────────────────────────

/** The lines of a head (beyond the header) that mention a term, at most MAX_MATCH_LINES. */
export function matchingLines(head: Head, terms: readonly string[]): string[] {
  const out: string[] = []
  for (const line of head.lines) {
    const trimmed = line.trim()
    if (!trimmed || COMMENT.test(line)) continue
    if (hits(terms, stemsOf(trimmed))) out.push(trimmed.slice(0, MATCH_LINE_CHARS))
    if (out.length >= MAX_MATCH_LINES) break
  }
  return out
}

/** One file as the decision model would read it, before redaction: check this with isSensitive. */
export function cardText(path: string, head: Head | undefined, terms: readonly string[]): string {
  const parts = [`path: ${path}`]
  if (head?.header) parts.push(`header: ${head.header.slice(0, HEADER_CHARS)}`)
  if (head?.symbols.length) parts.push(`defines: ${head.symbols.join(', ')}`)
  const lines = head ? matchingLines(head, terms) : []
  if (lines.length) parts.push(`lines: ${lines.join(' | ')}`)
  return parts.join('\n')
}

/** One file as the decision model reads it: cardText, redacted and capped. */
export function cardOf(path: string, head: Head | undefined, terms: readonly string[]): string {
  return redact(cardText(path, head, terms), CARD_CHARS)
}

/** Card indexes grouped into requests that fit, by encoded size and not by count. */
export function pack(cards: readonly string[]): number[][] {
  const batches: number[][] = []
  let current: number[] = []
  let used = 0
  cards.forEach((card, id) => {
    const cost = encode(card, { ensureAscii: true }).length + PER_CARD_OVERHEAD
    if (current.length && (current.length >= BATCH || used + cost > STATE_BUDGET)) {
      batches.push(current)
      current = []
      used = 0
    }
    current.push(id)
    used += cost
  })
  if (current.length) batches.push(current)
  return batches
}

export const VERDICT = {
  implements: 'The file is where the described behaviour is implemented: the code that does it lives here',
  related: 'The file uses, tests, configures, documents or wires up that behaviour, or holds a small part of it',
  unrelated: 'The file has nothing to do with what the query describes',
}
export type Verdict = keyof typeof VERDICT

/** One request's state and questions: the query, and each card asked about alone. */
export function request(query: string, cards: readonly string[], ids: readonly number[]):
  { state: Record<string, unknown>; questions: Record<string, Question> } {
  return {
    state: {
      query: redact(query, QUERY_CHARS),
      files: Object.fromEntries(ids.map(id => [`F${id}`, cards[id]!])),
    },
    questions: Object.fromEntries(ids.map(id => [`f${id}`,
      choice(`Does file F${id} implement what the query describes?`, VERDICT)])),
  }
}

// ── ranking ──────────────────────────────────────────────────────────────────

/** Where an unjudged file stands between a judged "related" (0.4 and up) and "unrelated" (near 0). */
export const UNJUDGED = 0.25

export type Ranked = { path: string; local: number; verdict?: Verdict; confidence?: number; relevance: number; reason: string }

/** How relevant the decision model's answer makes a file: P(implements) + 0.4·P(related). */
export function relevanceOf(answer: Answer | undefined): { verdict?: Verdict; confidence?: number; relevance: number } {
  if (!answer || answer.type !== 'choice') return { relevance: UNJUDGED }
  const p = answer.probabilities
  const relevance = (p.implements ?? (answer.choice === 'implements' ? answer.confidence : 0))
    + 0.4 * (p.related ?? (answer.choice === 'related' ? answer.confidence : 0))
  return { verdict: answer.choice as Verdict, confidence: answer.confidence, relevance }
}

/** A short reason from the local signals: the header's first sentence, else the names that matched. */
export function reasonOf(candidate: Candidate, terms: readonly string[]): string {
  const head = candidate.head
  if (head?.header) {
    const sentence = head.header.split(/(?<=[.!?])\s/)[0]!
    return sentence.length > 110 ? `${sentence.slice(0, 107)}...` : sentence
  }
  const named = head?.symbols.filter(s => hits(terms, stemsOf(s))) ?? []
  if (named.length) return `defines ${named.slice(0, 4).join(', ')}`
  return pathScore(candidate.path, terms) ? 'its path matches' : 'its text matches'
}

/**
 * The candidates in their final order: by the decision model's relevance where it answered
 * (an unjudged file at UNJUDGED), the local score breaking ties. Without answers, the local order.
 */
export function rank(candidates: readonly Candidate[], answers: ReadonlyMap<number, Answer>, terms: readonly string[]): Ranked[] {
  const ranked = candidates.map((c, id) => ({ id, path: c.path, local: c.score, reason: reasonOf(c, terms), ...relevanceOf(answers.get(id)) }))
  ranked.sort((a, b) => b.relevance - a.relevance || b.local - a.local || a.path.length - b.path.length || a.path.localeCompare(b.path))
  return ranked.map(({ id: _id, ...rest }) => rest)
}

// ── what the model reads ─────────────────────────────────────────────────────

export type Outcome = { by: 'jev' | 'local'; note?: string; searched: number; folder: string }

/** The tool's answer: a header line saying how it was ranked, then one line per file. */
export function render(query: string, ranked: readonly Ranked[], limit: number, outcome: Outcome): string {
  const shown = ranked.filter(r => outcome.by === 'local' || r.verdict !== 'unrelated' || r.relevance >= UNJUDGED).slice(0, limit)
  const how = outcome.by === 'jev' ? 'ranked by the decision model' : `local ranking only${outcome.note ? ` (${outcome.note})` : ''}`
  const head = `${shown.length} file${shown.length === 1 ? '' : 's'} for "${query.slice(0, 120)}" in ${outcome.folder}, ${how}; ${outcome.searched} files searched.`
  if (!shown.length) return `${head}\nNothing matched; try other words, or Grep for a name you know.`
  const lines = shown.map((r, i) => {
    const score = r.verdict ? `${r.verdict} ${r.confidence!.toFixed(2)}` : `score ${r.local.toFixed(1)}`
    return `${i + 1}. ${r.path} [${score}] ${r.reason}`
  })
  return [head, ...lines].join('\n')
}

// ── paths ────────────────────────────────────────────────────────────────────

/** `path` (absolute, or relative to `root`) as an absolute path with . and .. resolved. */
export function resolvePath(root: string, path: string): string {
  const joined = path.startsWith('/') ? path : `${root.replace(/\/+$/, '')}/${path}`
  const out: string[] = []
  for (const part of joined.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return `/${out.join('/')}`
}

/** Whether `path` is `root` or inside it. */
export function inside(root: string, path: string): boolean {
  const r = root.replace(/\/+$/, '') || '/'
  return path === r || path.startsWith(r === '/' ? '/' : `${r}/`)
}
