// The web filter's rules: plain functions, no IO, so the test kit can hold them to their word.
//
// After WebSearch: each result (title, URL, snippet) is one question to the decision model:
// does it help the search query and the person's latest request? Exact duplicate URLs go
// locally. The first `keepTop` distinct results always stay, in their order, and so does a
// result on a host the person named. The rest go when the decision model is at least
// `minConfidence` sure they do not help. One line at the end says how many went.
//
// After a long WebFetch: the text is cut into units (paragraphs, long ones split at sentences),
// packed into chunks of about CHUNK_CHARS with about OVERLAP_CHARS of the previous chunk at the
// start of each, so a chunk is judged with the context before it. Some chunks always stay
// (mustKeep, local): the first, code, dates, figures, and a heading or number the question names.
// The decision model judges the rest. A unit goes only when every chunk holding it was dropped,
// and each run of dropped units becomes one marker naming what was cut.

import { noul, type Question } from '../../engine/client'
import { isSensitive, redact } from '../../engine/privacy'
import { encode } from '../../engine/pyjson'

export const CHUNK_CHARS = 2000
export const OVERLAP_CHARS = 400
// A unit fits in the overlap, so every chunk after the first starts with at least one unit of the one before.
export const UNIT_CHARS = 400
export const QUERY_CHARS = 500
export const REQUEST_CHARS = 1500
export const RESULT_CHARS = 600
export const SENT_CHUNK_CHARS = 2400
export const MAX_SENT_RESULTS = 30
// One request, within the backend's 60,000-character state, with room for the questions.
export const STATE_BUDGET = 40_000
const PER_ITEM_OVERHEAD = 16

// ── hosts the person named ───────────────────────────────────────────────────

// A file name (index.ts) reads like a host too; it never matches a URL's host, so it does no harm.
const HOST = /\b(?:https?:\/\/)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})\b/gi

const bare = (host: string) => host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '')

/** The hosts a request names ("docs.python.org", "https://example.com/x"), lower case, without www. */
export function namedHosts(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(HOST)) {
    out.add(bare(m[1]!))
  }
  return [...out]
}

/** A URL's host, or '' when it has none. */
export function hostOf(url: string): string {
  try { return bare(new URL(url).hostname) } catch { return '' }
}

/** Whether the URL's host is one the person named, or under one. */
export function isNamed(url: string, named: readonly string[]): boolean {
  const host = hostOf(url)
  return Boolean(host) && named.some(n => host === n || host.endsWith(`.${n}`))
}

// ── search results ───────────────────────────────────────────────────────────

/**
 * One search result where it sits in WebSearch's record: `results[i]` is a string (the search
 * model's own words) or `{ tool_use_id, content: [{ title, url }, ...] }`; a flat `{ title, url }`
 * is read too. `at` is [i] or [i, j].
 */
export type Hit = { at: readonly number[]; url: string; title: string; snippet: string; item: unknown }

const str = (v: unknown) => (typeof v === 'string' ? v : '')

function hitOf(item: unknown, at: number[]): Hit | null {
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  if (typeof o.url !== 'string' || !o.url) return null
  return { at, url: o.url, title: str(o.title), snippet: str(o.snippet) || str(o.description) || str(o.page_age), item }
}

/** Every result a WebSearch record holds, in order. */
export function hitsOf(results: readonly unknown[]): Hit[] {
  const hits: Hit[] = []
  results.forEach((r, i) => {
    const content = r && typeof r === 'object' ? (r as { content?: unknown }).content : undefined
    if (Array.isArray(content)) content.forEach((c, j) => { const h = hitOf(c, [i, j]); if (h) hits.push(h) })
    else { const h = hitOf(r, [i]); if (h) hits.push(h) }
  })
  return hits
}

/** What a result costs the model to read: its record as text. */
export const hitChars = (h: Hit) => JSON.stringify(h.item).length

/** The hits to drop locally (later copies of an exact URL), and the hits that may be judged. */
export function triage(hits: readonly Hit[], keepTop: number, named: readonly string[]): { duplicates: Set<number>; ask: number[] } {
  const seen = new Set<string>()
  const duplicates = new Set<number>()
  const ask: number[] = []
  let distinct = 0
  hits.forEach((h, i) => {
    const url = h.url.trim()
    if (seen.has(url)) { duplicates.add(i); return }
    seen.add(url)
    distinct++
    if (distinct <= keepTop || isNamed(h.url, named)) return
    if (isSensitive(`${h.title}\n${h.url}\n${h.snippet}`)) return
    if (ask.length < MAX_SENT_RESULTS) ask.push(i)
  })
  return { duplicates, ask }
}

export const HELPS = noul(
  'Does this web search result help answer the search query and the person\'s latest request?',
  {
    true: 'Its page likely holds something the query or the request needs: an answer, a source, documentation, data',
    false: 'Off topic, spam, a content farm, a page about something else that shares a word, or a listing with nothing to add',
  },
)

/** The search request: the query, the person's request, and each result asked alone. */
export function searchRequest(query: string, request: string, hits: readonly Hit[], ids: readonly number[]):
  { state: Record<string, unknown>; questions: Record<string, Question> } {
  const results: Record<string, string> = {}
  let used = 0
  const asked: number[] = []
  for (const id of ids) {
    const h = hits[id]!
    const text = redact([h.title, h.url, h.snippet].filter(Boolean).join('\n'), RESULT_CHARS)
    const cost = encode(text, { ensureAscii: true }).length + PER_ITEM_OVERHEAD
    if (used + cost > STATE_BUDGET) break
    used += cost
    results[`R${id}`] = text
    asked.push(id)
  }
  return {
    state: { query: redact(query, QUERY_CHARS), request: redact(request || '(not known)', REQUEST_CHARS), results },
    questions: Object.fromEntries(asked.map(id => [`r${id}`, { ...HELPS, instructions: `${HELPS.instructions} (result R${id})` }])),
  }
}

/** The hits judged unhelpful: P(helps) at or under 1 - minConfidence. A hit with no answer stays. */
export function unhelpful(helps: ReadonlyMap<number, number>, minConfidence: number): Set<number> {
  const out = new Set<number>()
  for (const [id, p] of helps) if (1 - p >= minConfidence - 1e-9) out.add(id)
  return out
}

export const searchNote = (dropped: number, total: number, duplicates: number, judged: number) =>
  `[jev-mod web filter: dropped ${dropped} of ${total} results (${duplicates} duplicate, ${judged} judged unhelpful)]`

/** The results with the dropped hits taken out (an entry left with none goes too), and the note at the end. */
export function withoutHits(results: readonly unknown[], hits: readonly Hit[], drop: ReadonlySet<number>, note: string): unknown[] {
  const gone = new Set([...drop].map(i => hits[i]!.at.join(',')))
  const out: unknown[] = []
  results.forEach((r, i) => {
    if (gone.has(`${i}`)) return
    const content = r && typeof r === 'object' ? (r as { content?: unknown }).content : undefined
    if (!Array.isArray(content)) { out.push(r); return }
    const kept = content.filter((_, j) => !gone.has(`${i},${j}`))
    if (kept.length === content.length) out.push(r)
    else if (kept.length) out.push({ ...(r as object), content: kept })
  })
  return [...out, note]
}

// ── a long fetched page ──────────────────────────────────────────────────────

/** A piece of the text, [start, end), its trailing whitespace included: the units cover the text. */
export type Unit = { start: number; end: number }
export type Chunk = { units: number[]; text: string }

/** The text cut at blank lines, and a paragraph over UNIT_CHARS at sentence ends (or hard, as a last resort). */
export function unitsOf(text: string): Unit[] {
  const units: Unit[] = []
  const paragraphs = /[^]*?(?:\n[ \t]*\n\s*|$)/g
  for (const m of text.matchAll(paragraphs)) {
    if (!m[0]) break
    const start = m.index!
    split(text, start, start + m[0].length, units)
  }
  return units
}

function split(text: string, start: number, end: number, units: Unit[]): void {
  if (end - start <= UNIT_CHARS) { units.push({ start, end }); return }
  const sentence = /[^]*?(?:[.!?]["')\]]?\s+|\n|$)/g
  let open = start
  let last = start
  sentence.lastIndex = start
  for (let m = sentence.exec(text); m && m.index < end && m[0]; m = sentence.exec(text)) {
    const stop = Math.min(end, m.index + m[0].length)
    if (stop - open > UNIT_CHARS && last > open) { units.push({ start: open, end: last }); open = last }
    while (stop - open > UNIT_CHARS) { units.push({ start: open, end: open + UNIT_CHARS }); open += UNIT_CHARS }
    last = stop
    if (stop >= end) break
  }
  if (end > open) units.push({ start: open, end })
}

/**
 * Units packed into chunks of about CHUNK_CHARS; each chunk after the first starts with the
 * last units of the one before, up to OVERLAP_CHARS, and always moves on by one unit at least.
 */
export function chunksOf(text: string, units: readonly Unit[]): Chunk[] {
  const chunks: Chunk[] = []
  const len = (i: number) => units[i]!.end - units[i]!.start
  let first = 0
  while (first < units.length) {
    let last = first
    let size = len(first)
    while (last + 1 < units.length && size + len(last + 1) <= CHUNK_CHARS) size += len(++last)
    const ids = Array.from({ length: last - first + 1 }, (_, k) => first + k)
    chunks.push({ units: ids, text: text.slice(units[first]!.start, units[last]!.end) })
    if (last + 1 >= units.length) break
    let next = last + 1
    let overlap = 0
    while (next - 1 > first && overlap + len(next - 1) <= OVERLAP_CHARS) overlap += len(--next)
    first = next
  }
  return chunks
}

const STOP = new Set(['about', 'after', 'also', 'been', 'does', 'each', 'from', 'have', 'into', 'just', 'like', 'more',
  'most', 'only', 'other', 'over', 'page', 'some', 'such', 'than', 'that', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your', 'tell', 'find', 'show', 'give',
  'list', 'want', 'need', 'please', 'should', 'could', 'know', 'make', 'using', 'used', 'will'])

/** The question's content words (four letters or more, no stop words) and its numbers. */
export function termsOf(question: string): { words: Set<string>; numbers: Set<string> } {
  const lower = question.toLowerCase()
  const words = new Set((lower.match(/[a-z][a-z0-9_-]{3,}/g) ?? []).filter(w => !STOP.has(w)))
  const numbers = new Set(lower.match(/\d+(?:[.,]\d+)*/g)?.filter(n => n.length >= 2) ?? [])
  return { words, numbers }
}

const CODE = /```|~~~|^(?: {4}|\t)\S|`[^`\n]+`/m
const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?'
const DATE = new RegExp([
  '\\b(?:19|20)\\d{2}-\\d{1,2}-\\d{1,2}\\b',
  '\\b\\d{1,2}[/.]\\d{1,2}[/.](?:19|20)?\\d{2}\\b',
  `\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(?:19|20)\\d{2}\\b`,
  `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\s+(?:19|20)\\d{2}\\b`,
  `\\b${MONTH}\\s+(?:19|20)\\d{2}\\b`,
].join('|'), 'i')
// A figure, not a count in prose: money, a percentage, a version, a measurement, a large number.
const FIGURE = new RegExp([
  '[$€£¥]\\s?\\d',
  '\\d(?:\\.\\d+)?\\s?%',
  '\\bv?\\d+\\.\\d+(?:\\.\\d+)+\\b',
  '\\bv\\d+(?:\\.\\d+)?\\b',
  '\\b\\d[\\d,.]*\\s?(?:ms|kb|mb|gb|tb|kib|mib|gib|px|km|kg|mg|ml|hz|khz|mhz|ghz|mph|kph|°[cf]?|usd|eur|gbp)\\b',
  '\\b\\d{1,3}(?:,\\d{3})+\\b',
  '\\b\\d+\\.\\d+\\b',
].join('|'), 'i')
const HEADING = /^(?:#{1,6}\s+(.+)|(.{2,80})\n(?:=+|-+)\s*$)/gm

/** Why a chunk always stays without asking, or null to let the decision model judge it. */
export function mustKeep(chunk: string, index: number, terms: ReturnType<typeof termsOf>): string | null {
  if (index === 0) return 'first'
  if (CODE.test(chunk)) return 'code'
  if (DATE.test(chunk)) return 'date'
  if (FIGURE.test(chunk)) return 'figure'
  const numbers = chunk.match(/\d+(?:[.,]\d+)*/g) ?? []
  if (numbers.some(n => terms.numbers.has(n))) return 'number named'
  for (const m of chunk.matchAll(HEADING)) {
    const words = (m[1] ?? m[2] ?? '').toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? []
    if (words.some(w => terms.words.has(w))) return 'heading named'
  }
  return null
}

export const NEEDED = noul(
  'Does answering the fetch\'s prompt and the person\'s latest request need this part of the page?',
  {
    true: 'It holds something the answer depends on: a fact, a step, a definition, an example, a figure, a caveat, a source',
    false: 'Not for this question: navigation, boilerplate, other topics on the page, repetition, marketing, comments',
  },
)

/** The fetch request: the prompt, the person's request, and each chunk asked alone, as many as fit. */
export function fetchRequest(prompt: string, request: string, url: string, chunks: readonly Chunk[], ids: readonly number[]):
  { state: Record<string, unknown>; questions: Record<string, Question>; asked: number[] } {
  const parts: Record<string, string> = {}
  let used = 0
  const asked: number[] = []
  for (const id of ids) {
    const text = redact(chunks[id]!.text, SENT_CHUNK_CHARS)
    const cost = encode(text, { ensureAscii: true }).length + PER_ITEM_OVERHEAD
    if (used + cost > STATE_BUDGET) break
    used += cost
    parts[`C${id}`] = text
    asked.push(id)
  }
  return {
    state: { url: redact(url, QUERY_CHARS), prompt: redact(prompt || '(none)', QUERY_CHARS),
      request: redact(request || '(not known)', REQUEST_CHARS), parts },
    questions: Object.fromEntries(asked.map(id => [`c${id}`, { ...NEEDED, instructions: `${NEEDED.instructions} (part C${id})` }])),
    asked,
  }
}

/** The units every chunk holding them was dropped from. */
export function droppedUnits(chunks: readonly Chunk[], dropped: ReadonlySet<number>): Set<number> {
  const kept = new Set<number>()
  const out = new Set<number>()
  chunks.forEach((c, id) => { if (!dropped.has(id)) c.units.forEach(u => kept.add(u)) })
  chunks.forEach((c, id) => { if (dropped.has(id)) c.units.forEach(u => { if (!kept.has(u)) out.add(u) }) })
  return out
}

/** What a cut stood for: its first heading, else its first words. */
export function nameOf(cut: string): string {
  HEADING.lastIndex = 0
  const heading = HEADING.exec(cut)
  HEADING.lastIndex = 0
  const text = (heading ? heading[1] ?? heading[2]! : cut).replace(/\s+/g, ' ').trim()
  return text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text
}

export const marker = (chars: number, name: string) =>
  `[jev-mod web filter: cut ${chars.toLocaleString('en-US')} characters here, starting "${name}"]\n\n`

/** The text with each run of dropped units replaced by one marker. */
export function withoutUnits(text: string, units: readonly Unit[], drop: ReadonlySet<number>): { text: string; cuts: number } {
  let out = ''
  let cuts = 0
  for (let i = 0; i < units.length;) {
    if (!drop.has(i)) { out += text.slice(units[i]!.start, units[i]!.end); i++; continue }
    let j = i
    while (j + 1 < units.length && drop.has(j + 1)) j++
    const cut = text.slice(units[i]!.start, units[j]!.end)
    out += marker(cut.length, nameOf(cut))
    cuts++
    i = j + 1
  }
  return { text: out, cuts }
}

export const fetchNote = (cut: number, total: number, parts: number) =>
  `\n\n[jev-mod web filter: cut ${cut.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} characters of this result (${parts} part${parts === 1 ? '' : 's'}) the question did not need]`
