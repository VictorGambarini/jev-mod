// /jev-mod compact's selection: what Jev is asked, and what the conversation becomes after a
// compaction with no summariser.
//
// Two kinds of thing are judged. A message's text, in a message holding no tool call or result,
// is kept or dropped (`unitsOf`, `keepOnly`): it goes only when Jev confidently marked it drop.
// A tool call with its result is never dropped: the call stays as it is, and the result is
// trimmed to the start and end Jev says later work needs (`trimsOf`, `trimmed`), the full call
// and result being saved to a file first. A message that holds a tool call or result therefore
// always stays, with its text, so every tool_use keeps its tool_result and the API never sees
// half a pair; its text is not sent to Jev, since nothing would be done with the answer.

import { KEEP_LAST, TRIM_SHOWN, type TrimView } from '../../engine/compact'
import { isSensitive } from '../../engine/privacy'

export type Msg = {
  role: string
  text: string
  toolUses?: readonly { tool_use_id: string; tool?: string; input?: Record<string, unknown>; text?: string; isError?: boolean }[]
  toolResults?: readonly { tool_use_id: string; text?: string; isError?: boolean; result?: unknown }[]
  handle?: string
}

/** The last messages, kept whatever Jev says: the same tail the engine keeps by default. */
export const ALWAYS_KEEP_LAST = KEEP_LAST

/** A result this short or shorter is kept whole and not sent: trimming it saves too little. */
export const TRIM_MIN_CHARS = 1300

/** One text Jev judges keep or drop, by message index. */
export type Unit = { text: number }

// The arguments that say what a call did, in the order they are shown.
const MAIN_ARGS = ['command', 'file_path', 'notebook_path', 'path', 'pattern', 'glob', 'url', 'query', 'skill', 'description', 'prompt']

/** A call's main argument (its command, path, pattern...), else its whole input as JSON. */
export function argsOf(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  const main = MAIN_ARGS.map(k => input[k]).filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  if (main.length) return main.join(' ')
  try { return JSON.stringify(input) } catch { return '' }
}

const hasTools = (m: Msg) => !!(m.toolUses?.length || m.toolResults?.length)

/**
 * What to send Jev for keep or drop, in order, with the message each entry judges: the text of
 * each message outside the last ALWAYS_KEEP_LAST that holds no tool call or result.
 */
export function unitsOf(messages: readonly Msg[]): { units: Unit[]; toJev: { role: string; content: string }[] } {
  const tail = Math.max(0, messages.length - ALWAYS_KEEP_LAST)
  const units: Unit[] = []
  const toJev: { role: string; content: string }[] = []
  messages.forEach((m, i) => {
    if (i >= tail || hasTools(m) || typeof m.text !== 'string' || !m.text.trim()) return
    units.push({ text: i })
    toJev.push({ role: m.role, content: m.text })
  })
  return { units, toJev }
}

/**
 * The messages `/jev-mod compact` keeps, in order. `fates` is indexed by position in `units`
 * (the engine already turns a low-confidence drop into keep). A message goes only when its text
 * is a unit marked drop and it holds no tool call or result; the last ALWAYS_KEEP_LAST stay.
 */
export function keepOnly<M extends Msg>(messages: readonly M[], units: readonly Unit[], fates: Record<string, string>): M[] {
  const tail = Math.max(0, messages.length - ALWAYS_KEEP_LAST)
  const drop = new Set<number>()
  units.forEach((u, j) => {
    if (fates[String(j)] === 'drop' && u.text < tail && messages[u.text] && !hasTools(messages[u.text]!)) drop.add(u.text)
  })
  return messages.filter((_, i) => !drop.has(i))
}

/** One tool call with its result, both in the conversation. */
export type Pair = { id: string; tool: string; input: Record<string, unknown>; text: string; isError: boolean; call: number; result: number }

function pairsOf(messages: readonly Msg[]): Pair[] {
  const calls = new Map<string, { i: number; tool: string; input: Record<string, unknown> }>()
  messages.forEach((m, i) => {
    for (const use of m.toolUses ?? []) calls.set(use.tool_use_id, { i, tool: use.tool || 'tool', input: use.input ?? {} })
  })
  const pairs: Pair[] = []
  messages.forEach((m, i) => {
    for (const r of m.toolResults ?? []) {
      const call = calls.get(r.tool_use_id)
      if (!call || typeof r.text !== 'string') continue // a result without its call is left whole
      pairs.push({ id: r.tool_use_id, tool: call.tool, input: call.input, text: r.text, isError: !!r.isError, call: call.i, result: i })
    }
  })
  return pairs
}

/**
 * The tool results Jev is asked to trim, each with what it sees: the call, the result's size,
 * and its first and last TRIM_SHOWN characters (the engine redacts them). Left whole and not
 * sent: a pair with a half among the last ALWAYS_KEEP_LAST messages, a result of TRIM_MIN_CHARS
 * or fewer, and a pair whose call or full result looks sensitive.
 */
export function trimsOf(messages: readonly Msg[]): { pairs: Pair[]; views: TrimView[] } {
  const tail = Math.max(0, messages.length - ALWAYS_KEEP_LAST)
  const pairs: Pair[] = []
  const views: TrimView[] = []
  for (const p of pairsOf(messages)) {
    if (p.call >= tail || p.result >= tail) continue
    const points = [...p.text]
    if (points.length <= TRIM_MIN_CHARS) continue
    const arg = argsOf(p.input)
    if (isSensitive(`${p.tool} ${arg}\n${p.text}`)) continue
    pairs.push(p)
    views.push({ tool: p.tool, arg, size: points.length, isError: p.isError,
      head: points.slice(0, TRIM_SHOWN).join(''), tail: points.slice(-TRIM_SHOWN).join('') })
  }
  return { pairs, views }
}

const count = (n: number) => n.toLocaleString('en-US')

/** The line that stands where a result's middle was: what was cut, and the file that holds it all. */
export function placeholder(p: Pair, head: number, tail: number, file: string): string {
  const size = [...p.text].length
  const arg = argsOf(p.input).replace(/\s+/g, ' ').trim()
  const shown = arg.length > 160 ? `${arg.slice(0, 157)}...` : arg
  const kept = head && tail ? `its first ${head} and last ${tail}` : head ? `its first ${head}` : tail ? `its last ${tail}` : 'none of it'
  return `[jev-mod compact trimmed this ${p.tool}${shown ? ` (${shown})` : ''} result: ${count(size - head - tail)} of its ` +
    `${count(size)} characters were cut, keeping ${kept}. The full call and result are in ${file}; Read it if you need the rest.]`
}

/** The result with its middle replaced by `note`, or null when that would not make it shorter. */
export function cut(text: string, head: number, tail: number, note: string): string | null {
  const points = [...text]
  if (head + tail >= points.length) return null
  const out = [head ? points.slice(0, head).join('') : null, note, tail ? points.slice(-tail).join('') : null]
    .filter((s): s is string => s !== null).join('\n')
  return [...out].length < points.length ? out : null
}

/** What a saved file holds: the call and its full result, so a later step can read what was cut. */
export function saved(p: Pair, session: string | null): string {
  let input: string
  try { input = JSON.stringify(p.input, null, 2) } catch { input = String(p.input) }
  return [`jev-mod compact saved this tool call and its full result before trimming the result in the conversation` +
    `${session ? ` (session ${session})` : ''}.`, `tool: ${p.tool}`, `tool_use_id: ${p.id}`, `input:\n${input}`,
    `result${p.isError ? ' (error)' : ''}, ${count([...p.text].length)} characters:`, p.text].join('\n')
}

/**
 * The messages with each trimmed result's text replaced (`texts`, by tool_use_id). A message
 * that changed is handed back without the engine's `handle`, so the engine builds it from its
 * role, text and tool blocks; a trimmed result loses its stored record (`result`), which held
 * the bulk. Every other message is the engine's own, untouched.
 */
export function trimmed<M extends Msg>(messages: readonly M[], texts: ReadonlyMap<string, string>): M[] {
  return messages.map(m => {
    if (!m.toolResults?.some(r => texts.has(r.tool_use_id))) return m
    const { handle: _handle, ...rest } = m
    return {
      ...rest,
      toolResults: m.toolResults.map(r => {
        const text = texts.get(r.tool_use_id)
        if (text === undefined) return r
        const { result: _result, ...kept } = r
        return { ...kept, text }
      }),
    } as unknown as M
  })
}
