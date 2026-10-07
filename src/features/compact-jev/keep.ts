// /compact-jev's selection: which messages survive a compaction with no summariser.

export type Msg = {
  role: string
  text: string
  toolUses?: readonly { tool_use_id: string }[]
  toolResults?: readonly { tool_use_id: string }[]
}

export const ALWAYS_KEEP_LAST = 6

/**
 * The messages `/compact-jev` keeps, in order: those Jev marked keep, the last
 * ALWAYS_KEEP_LAST, and whatever completes a kept tool call (its result) or a kept result
 * (its call), since a request with one half of a pair is refused. `fates` is indexed by
 * position in `sent`, the messages that had text to send; a message without text (a tool
 * call or result alone) stays only as the other half of a kept pair or in the tail.
 */
export function keepOnly<M extends Msg>(messages: readonly M[], sent: readonly number[], fates: Record<string, string>): M[] {
  const keep = new Set<number>()
  sent.forEach((index, j) => { if (fates[String(j)] === 'keep') keep.add(index) })
  for (let i = Math.max(0, messages.length - ALWAYS_KEEP_LAST); i < messages.length; i++) keep.add(i)
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
      const m = messages[i]
      const partners = [
        ...(m.toolUses ?? []).map(u => resultAt.get(u.tool_use_id)),
        ...(m.toolResults ?? []).map(r => callAt.get(r.tool_use_id)),
      ]
      for (const j of partners) if (j !== undefined && !keep.has(j)) { keep.add(j); grew = true }
    }
  }
  return messages.filter((_, i) => keep.has(i))
}
