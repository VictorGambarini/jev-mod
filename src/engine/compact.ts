// Compaction without a summary: the decision model marks each turn keep or drop, and in doubt a
// turn is kept.
//
// Ported from jev-skills' jevkit/compact.py `select`, the part /jev-mod compact uses, with one
// deliberate divergence (docs/PORTING.md): jev-skills also offers "summarize", and the mod has no
// summariser, so a summarize turn would be deleted. Here the question is keep or drop only, the
// keep criterion also covers background whose gist later work needs, and an unjudged turn is kept.
// One request
// per batch of up to 40 turns, packed by encoded size; a long turn is judged on its first and
// last 350 characters, redacted. Dropping is the only fate that cannot be undone, so it needs a
// confident answer: a drop below DROP_CONFIDENCE is a keep. The digest and handoff prompts are for jev-skills' handoff writer, which
// the mod does not have.

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
export const DROP_CONFIDENCE = 0.7
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

/** Turn indexes grouped into requests that fit, by encoded size and not by count. */
export function pack(messages: readonly Message[], judged: number[]): number[][] {
  const batches: number[][] = []
  let current: number[] = []
  let used = 0
  for (const index of judged) {
    const cost = encode(redact(textOf(messages[index]!), TURN_CHARS), { ensureAscii: true }).length + PER_TURN_OVERHEAD
    if (current.length && (current.length >= BATCH || used + cost > STATE_BUDGET)) {
      batches.push(current)
      current = []
      used = 0
    }
    current.push(index)
    used += cost
  }
  if (current.length) batches.push(current)
  return batches
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
export async function select(host: Host, messages: readonly Message[], opts: { keepLast?: number; timeoutMs?: number } = {}): Promise<Selection> {
  const total = messages.length
  const keepLast = opts.keepLast ?? KEEP_LAST
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
      if (answer.choice === 'drop' && answer.confidence < DROP_CONFIDENCE) continue
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
