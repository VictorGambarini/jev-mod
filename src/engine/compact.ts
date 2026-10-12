// Compaction without a summary, in two decisions. The decision model marks each turn keep or
// drop, and in doubt a turn is kept (`select`). And for each old tool call with its result it
// says whether the pair stays at all, and how much of the result's start and end does, the full
// pair being saved to a file a later step can read (`trim`); in doubt it keeps more.
//
// `select` is ported from jev-skills' jevkit/compact.py `select`, the part /jev-mod compact uses,
// with one deliberate divergence (docs/PORTING.md): jev-skills also offers "summarize", and the
// mod has no summariser, so a summarize turn would be deleted. Here the question is keep or drop
// only, the keep criterion also covers background whose gist later work needs, and an unjudged
// turn is kept. One request per batch of up to 40 turns, packed by encoded size; a long turn is
// judged on its first and last 350 characters, redacted. Dropping is the only fate that cannot be
// undone, so it needs a confident answer: a drop below DROP_CONFIDENCE (or the caller's
// `dropConfidence`) is a keep. `trim` is the mod's own (jev-skills has no counterpart). The digest
// and handoff prompts are for jev-skills' handoff writer, which the mod does not have.

import { ask, choice, JevError, type Asked, type Host } from './client'
import { isSensitive, redact } from './privacy'
import { encode } from './pyjson'
import { strip } from './pyre'

export const TURN_CHARS = 700
export const BATCH = 40
// The client measures the JSON-encoded state, and one CJK character encodes to six, so batches
// are packed by that size and not by count; room is left for the questions.
export const STATE_BUDGET = 40_000
const PER_TURN_OVERHEAD = 16
export const DROP_CONFIDENCE = 0.5
/** The last turns kept without asking; /jev-mod compact keeps the same number of messages. */
export const KEEP_LAST = 6
export const FATE = {
  keep: 'Carries a decision, a constraint, a user preference, an unfinished task, an exact value, path, id, '
    + 'command or error that later work depends on, or is background whose gist later work needs',
  drop: 'Chatter, acknowledgements, superseded attempts, repeated output, or detail nothing later depends on',
}
export type Fate = keyof typeof FATE

export type Message = { role?: string; content?: unknown }

/** A message's text: a string, the text parts of a list, nothing for none (never "None"). */
export function textOf(message: Message): string {
  let content = message.content
  if (Array.isArray(content)) {
    content = content.filter(part => part && typeof part === 'object' && !Array.isArray(part))
      .map(part => String((part as Record<string, unknown>).text ?? '')).join(' ')
  }
  if (typeof content === 'string') return content
  return content === null || content === undefined ? '' : String(content)
}

/** Items grouped into requests of at most `most` that fit STATE_BUDGET, by each one's encoded size. */
function packBy(items: readonly number[], costOf: (item: number) => number, most: number): number[][] {
  const batches: number[][] = []
  let current: number[] = []
  let used = 0
  for (const item of items) {
    const cost = costOf(item)
    if (current.length && (current.length >= most || used + cost > STATE_BUDGET)) {
      batches.push(current)
      current = []
      used = 0
    }
    current.push(item)
    used += cost
  }
  if (current.length) batches.push(current)
  return batches
}

/** Turn indexes grouped into requests that fit, by encoded size and not by count. */
export function pack(messages: readonly Message[], judged: number[]): number[][] {
  return packBy(judged, i => encode(redact(textOf(messages[i]!), TURN_CHARS), { ensureAscii: true }).length + PER_TURN_OVERHEAD, BATCH)
}

export type Selection = {
  status: 'ok' | 'partial' | 'fail_open'
  fates: Record<string, Fate>
  counts: Record<Fate, number>
  jev_calls: number
  errors: string[]
  latency_ms: number
  unjudged: number[]
  /** Every request that answered, for the caller's tally; not part of compact.select's reply. */
  calls?: Asked[]
}

/** A fate for every message index. The last `keepLast` are always kept, and so is a system turn. */
export async function select(host: Host, messages: readonly Message[],
  opts: { keepLast?: number; timeoutMs?: number; dropConfidence?: number } = {}): Promise<Selection> {
  const total = messages.length
  const keepLast = opts.keepLast ?? KEEP_LAST
  const dropConfidence = opts.dropConfidence ?? DROP_CONFIDENCE
  const fates = new Map<number, Fate>()
  for (let i = Math.max(0, total - keepLast); i < total; i++) fates.set(i, 'keep')
  let judged = [...Array(total).keys()].filter(i => !fates.has(i))
  for (const i of judged) fates.set(i, 'keep') // nothing is dropped unless the model says so
  judged = judged.filter(i => messages[i]!.role !== 'system' && strip(textOf(messages[i]!)) !== '')

  const calls: Asked[] = []
  const errors: string[] = []
  const answered = new Set<number>()
  let latency = 0
  for (const group of pack(messages, judged)) {
    const sendable = group.filter(i => !isSensitive(textOf(messages[i]!)))
    if (!sendable.length) continue
    const state = { turns: Object.fromEntries(sendable.map(i => [`T${i}`, `${messages[i]!.role ?? 'user'}: ${redact(textOf(messages[i]!), TURN_CHARS)}`])) }
    const questions = Object.fromEntries(sendable.map(i => [`t${i}`, choice(`For continuing this work later, what should happen to turn T${i}?`, FATE)]))
    let reply: Asked
    try {
      reply = await ask(host, state, questions, { timeoutMs: opts.timeoutMs ?? 8000 })
    } catch (error) {
      if (!(error instanceof JevError)) throw error
      errors.push(error.code)
      continue
    }
    calls.push(reply)
    latency += reply.latency_ms
    for (const i of sendable) {
      answered.add(i)
      const answer = reply.answers[`t${i}`] as { choice: Fate; confidence: number }
      if (answer.choice === 'drop' && answer.confidence < dropConfidence) continue
      fates.set(i, answer.choice)
    }
  }
  const counts = { keep: 0, drop: 0 }
  for (const fate of fates.values()) counts[fate]++
  // One good batch must not hide the failed ones: "ok" only when every batch was judged.
  const status = !judged.length ? 'ok' : !calls.length ? 'fail_open' : errors.length ? 'partial' : 'ok'
  return {
    status, fates: Object.fromEntries([...fates].sort(([a], [b]) => a - b).map(([i, fate]) => [String(i), fate])),
    counts, jev_calls: calls.length, errors, latency_ms: latency, unjudged: judged.filter(i => !answered.has(i)), calls,
  }
}

// ── tool pairs: keep or drop, and how far to trim ───────────────────────────

/** What may stay of a tool result's start, and of its end, in characters. */
export const TRIM_SIZES = [0, 100, 300, 600] as const
export type TrimSize = (typeof TRIM_SIZES)[number]
/** Each end Jev is shown is as long as the most it may keep of it. */
export const TRIM_SHOWN = 600
/** Pairs per request; each is up to three questions. */
export const TRIM_BATCH = 20
const ARG_CHARS = 160

/** Whether a tool call and its result stay in the conversation at all. */
export const PAIR_FATE = {
  keep: 'A later step needs this call or what it returned in front of it: a decision, an error, an exact value, path, ' +
    'id or code later work depends on, or the state of something still being worked on',
  drop: 'Nothing later depends on it, or a later step could re-read the file: a superseded attempt, repeated output, ' +
    'or side work whose answer was already given',
}

/** The options for one end of a result: how many of its characters stay. */
export function trimOptions(end: 'start' | 'end'): Record<string, string> {
  return {
    0: `None of its ${end}: nothing there is needed later, or a later step could re-read the file if it ever is`,
    100: `About a line of its ${end}: a later step needs only what it was, such as a header, a count or a final status`,
    300: `A few lines of its ${end}: a later step needs a short passage there, such as an error or a result it refers to`,
    600: `All ${TRIM_SHOWN} characters of its ${end} shown: a later step depends on exact values, paths, code or errors there`,
  }
}

/**
 * One tool call with its result, as Jev sees it. With `trim`, `head` and `tail` are the result's
 * raw first and last TRIM_SHOWN characters, and Jev is asked how many of each stay; without it
 * (a short result), `head` is the whole result, `tail` is empty, and Jev is asked keep or drop only.
 */
export type TrimView = { tool: string; arg: string; size: number; isError: boolean; head: string; tail: string; trim: boolean }
/** A judged pair: whether it stays, and what of its result does (TRIM_SHOWN both ways for a short one: all of it). */
export type Trim = { keep: boolean; head: TrimSize; tail: TrimSize }

export type Trimming = {
  status: 'ok' | 'partial' | 'fail_open'
  /** What happens to each judged view, by its index; an unjudged one has none. */
  trims: Record<string, Trim>
  jev_calls: number
  errors: string[]
  latency_ms: number
  unjudged: number[]
  calls?: Asked[]
}

/** A view as the request holds it: the call, the result's size, and its start and end (or all of it), redacted. */
export function trimText(v: TrimView): string {
  const call = `tool call ${v.tool}: ${redact(v.arg, ARG_CHARS)}\nresult${v.isError ? ' (error)' : ''}: ${v.size} characters`
  if (!v.trim) return `${call}\nwhole: ${redact(v.head, Number.POSITIVE_INFINITY)}`
  return `${call}\nstart: ${redact(v.head, Number.POSITIVE_INFINITY)}\nend: ${redact(v.tail, Number.POSITIVE_INFINITY)}`
}

type Choice = { choice: string; confidence: number } | undefined

/**
 * For each tool call with its result: whether it stays at all, and how much of its result's
 * start and end does, from the decision model, in one request per batch. The caller saves every
 * full call and result to a file first, so a later step can read what went; each question asks
 * whether a later step needs it in front of it, or could re-read the file. In doubt it keeps
 * more: a drop below the confidence bar (DROP_CONFIDENCE, or the caller's) keeps the pair, a size
 * below it keeps all TRIM_SHOWN characters of that end, and a view Jev did not answer in full is
 * unjudged and stays whole.
 */
export async function trim(host: Host, views: readonly TrimView[],
  opts: { timeoutMs?: number; confidence?: number } = {}): Promise<Trimming> {
  const bar = opts.confidence ?? DROP_CONFIDENCE
  const texts = views.map(trimText)
  const calls: Asked[] = []
  const errors: string[] = []
  const trims: Record<string, Trim> = {}
  let latency = 0
  const sizeOf = (answer: Choice): TrimSize | undefined => {
    if (!answer) return undefined
    const n = Number(answer.choice) as TrimSize
    if (!TRIM_SIZES.includes(n)) return undefined
    return answer.confidence < bar ? TRIM_SHOWN : n
  }
  const all = [...views.keys()]
  for (const group of packBy(all, i => encode(texts[i]!, { ensureAscii: true }).length + PER_TURN_OVERHEAD, TRIM_BATCH)) {
    const state = { results: Object.fromEntries(group.map(i => [`R${i}`, texts[i]!])) }
    const questions = Object.fromEntries(group.flatMap(i => [
      [`k${i}`, choice(`Tool call R${i} and its result are saved in full to a file a later step can read. For continuing ` +
        `this work later, should R${i} stay in the conversation at all, or could a later step re-read the file?`, PAIR_FATE)],
      ...(views[i]!.trim ? [
        [`h${i}`, choice(`If R${i} stays: would a later step need the first characters of its result in front of it, or ` +
          'could it re-read the file? How many of its first characters should stay?', trimOptions('start'))],
        [`e${i}`, choice(`If R${i} stays: would a later step need the last characters of its result in front of it, or ` +
          'could it re-read the file? How many of its last characters should stay?', trimOptions('end'))],
      ] : []),
    ]))
    let reply: Asked
    try {
      reply = await ask(host, state, questions, { timeoutMs: opts.timeoutMs ?? 8000 })
    } catch (error) {
      if (!(error instanceof JevError)) throw error
      errors.push(error.code)
      continue
    }
    calls.push(reply)
    latency += reply.latency_ms
    for (const i of group) {
      const fate = reply.answers[`k${i}`] as Choice
      if (!fate || (fate.choice !== 'keep' && fate.choice !== 'drop')) continue
      const head = views[i]!.trim ? sizeOf(reply.answers[`h${i}`] as Choice) : TRIM_SHOWN
      const tail = views[i]!.trim ? sizeOf(reply.answers[`e${i}`] as Choice) : TRIM_SHOWN
      if (head === undefined || tail === undefined) continue
      trims[String(i)] = { keep: fate.choice === 'keep' || fate.confidence < bar, head, tail }
    }
  }
  const status = !views.length ? 'ok' : !calls.length ? 'fail_open' : errors.length ? 'partial' : 'ok'
  return { status, trims, jev_calls: calls.length, errors, latency_ms: latency, unjudged: all.filter(i => !trims[String(i)]), calls }
}
