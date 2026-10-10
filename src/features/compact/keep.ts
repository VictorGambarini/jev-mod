// /jev-mod compact's selection: what Jev is asked to judge, and which messages survive a
// compaction with no summariser: all but those Jev confidently marked drop.
//
// Jev judges units, not messages. A message's text (its narration) is one unit; a tool call and
// its result are one unit together (the call: the tool's name and its main argument; the result:
// its head and tail, redacted), so a pair always shares one fate: a request with half a pair is
// refused by the API. A message goes only when every part of it (its text and each tool pair it
// holds) was judged drop; a part Jev did not judge keeps its message, and so does the other
// half of any kept pair.

import { KEEP_LAST, TURN_CHARS } from '../../engine/compact'
import { isSensitive, redact } from '../../engine/privacy'

export type Msg = {
  role: string
  text: string
  toolUses?: readonly { tool_use_id: string; tool?: string; input?: Record<string, unknown>; text?: string; isError?: boolean }[]
  toolResults?: readonly { tool_use_id: string; text?: string; isError?: boolean }[]
}

/** The last messages, kept whatever Jev says: the same tail the engine keeps by default. */
export const ALWAYS_KEEP_LAST = KEEP_LAST

/** One thing Jev judges: a message's text (by message index), or a tool call with its result (by id). */
export type Unit = { text: number } | { pair: string }

const INPUT_CHARS = 160
// What a pair's summary may take, below the engine's own cap so that cap never cuts it again
// (the engine redacts the summary once more, which can lengthen a masked value a little).
const PAIR_CHARS = TURN_CHARS - 50
// The arguments that say what a call did, in the order they are shown.
const MAIN_ARGS = ['command', 'file_path', 'notebook_path', 'path', 'pattern', 'glob', 'url', 'query', 'skill', 'description', 'prompt']

/** Redacted, and when longer than `cap`, its head and tail with how much is not shown. */
export function clip(text: string, cap: number): string {
  const points = [...redact(text, Number.POSITIVE_INFINITY)]
  if (points.length <= cap) return points.join('')
  const half = Math.max(1, Math.floor((cap - 30) / 2))
  return `${points.slice(0, half).join('')}\n… ${points.length - 2 * half} chars not shown …\n${points.slice(-half).join('')}`
}

function argsOf(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  const main = MAIN_ARGS.map(k => input[k]).filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  if (main.length) return main.join(' ')
  try { return JSON.stringify(input) } catch { return '' }
}

type Pair = { call?: number; result?: number; tool: string; input: string; output: string; isError: boolean }

function pairsOf(messages: readonly Msg[]): Map<string, Pair> {
  const pairs = new Map<string, Pair>()
  const get = (id: string) => {
    let p = pairs.get(id)
    if (!p) { p = { tool: 'tool', input: '', output: '', isError: false }; pairs.set(id, p) }
    return p
  }
  messages.forEach((m, i) => {
    for (const use of m.toolUses ?? []) {
      const p = get(use.tool_use_id)
      p.call = i
      p.tool = use.tool || 'tool'
      p.input = argsOf(use.input)
      if (!p.output && typeof use.text === 'string') p.output = use.text
      if (use.isError) p.isError = true
    }
    for (const result of m.toolResults ?? []) {
      const p = get(result.tool_use_id)
      p.result = i
      if (typeof result.text === 'string' && result.text) p.output = result.text
      if (result.isError) p.isError = true
    }
  })
  return pairs
}

/**
 * What to send Jev, in order, with the unit each entry judges. The last ALWAYS_KEEP_LAST
 * messages, and a pair with a half among them, are not sent (they are kept anyway); nor is a
 * pair whose call or full result looks sensitive: unsent, it is unjudged, and so kept.
 */
export function unitsOf(messages: readonly Msg[]): { units: Unit[]; toJev: { role: string; content: string }[] } {
  const tail = Math.max(0, messages.length - ALWAYS_KEEP_LAST)
  const pairs = pairsOf(messages)
  const units: Unit[] = []
  const toJev: { role: string; content: string }[] = []
  messages.forEach((m, i) => {
    if (i >= tail) return
    if (typeof m.text === 'string' && m.text.trim()) { units.push({ text: i }); toJev.push({ role: m.role, content: m.text }) }
    const ids = [...(m.toolUses ?? []).map(u => u.tool_use_id), ...(m.toolResults ?? []).map(r => r.tool_use_id)]
    for (const id of ids) {
      const p = pairs.get(id)!
      if ((p.call ?? p.result) !== i) continue // each pair once, where it starts
      if ((p.call ?? -1) >= tail || (p.result ?? -1) >= tail) continue
      if (isSensitive(`${p.tool} ${p.input}\n${p.output}`)) continue
      const answered = p.result !== undefined || p.output !== ''
      const head = `${p.call === undefined ? 'result of a tool call' : `tool call ${p.tool}`}: ${clip(p.input, INPUT_CHARS)}`
      const label = answered ? `\nresult${p.isError ? ' (error)' : ''}: ` : '\nresult: none'
      const room = Math.max(100, PAIR_CHARS - [...head].length - label.length)
      units.push({ pair: id })
      toJev.push({ role: 'tool', content: head + label + (answered ? clip(p.output, room) : '') })
    }
  })
  return { units, toJev }
}

/**
 * The messages `/jev-mod compact` keeps, in order. `fates` is indexed by position in `units`
 * (the engine already turns a low-confidence drop into keep). A message goes only when it has a
 * part and every part (its text, each tool pair it holds) is a unit marked drop; the last
 * ALWAYS_KEEP_LAST stay, and so does whatever completes a kept tool call or a kept result.
 */
export function keepOnly<M extends Msg>(messages: readonly M[], units: readonly Unit[], fates: Record<string, string>): M[] {
  const textFate = new Map<number, string>()
  const pairFate = new Map<string, string>()
  units.forEach((u, j) => {
    const fate = fates[String(j)]
    if (fate === undefined) return
    if ('text' in u) textFate.set(u.text, fate); else pairFate.set(u.pair, fate)
  })
  const tail = Math.max(0, messages.length - ALWAYS_KEEP_LAST)
  const keep = new Set<number>()
  messages.forEach((m, i) => {
    const parts: (string | undefined)[] = [
      ...(typeof m.text === 'string' && m.text.trim() ? [textFate.get(i)] : []),
      ...(m.toolUses ?? []).map(u => pairFate.get(u.tool_use_id)),
      ...(m.toolResults ?? []).map(r => pairFate.get(r.tool_use_id)),
    ]
    if (i >= tail || !parts.length || parts.some(f => f !== 'drop')) keep.add(i)
  })
  const callAt = new Map<string, number>()
  const resultAt = new Map<string, number>()
  messages.forEach((m, i) => {
    for (const use of m.toolUses ?? []) callAt.set(use.tool_use_id, i)
    for (const result of m.toolResults ?? []) resultAt.set(result.tool_use_id, i)
  })
  let grew = true
  while (grew) {
    grew = false
    for (const i of [...keep]) {
      const m = messages[i]!
      const partners = [
        ...(m.toolUses ?? []).map(u => resultAt.get(u.tool_use_id)),
        ...(m.toolResults ?? []).map(r => callAt.get(r.tool_use_id)),
      ]
      for (const j of partners) if (j !== undefined && !keep.has(j)) { keep.add(j); grew = true }
    }
  }
  return messages.filter((_, i) => keep.has(i))
}
