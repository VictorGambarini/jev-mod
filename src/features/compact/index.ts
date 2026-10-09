import { hostOf } from '../../core/host'
import * as activity from '../../core/activity'
import type { IO } from '../../core/io'
import { recordCalls } from '../../core/jev'
import { select } from '../../engine/compact'
import { keepOnly } from './keep'

// /jev-mod compact: a compaction with no summariser. Jev marks each turn keep or drop;
// only a turn it confidently marks drop goes (the last few and both halves of any kept tool
// call stay), and what is left is the new context. In doubt, a turn is kept; a turn Jev did not
// judge (a partial answer, a sensitive turn) is kept. `/compact` itself is untouched.
//
// A command's own hook may not compact (the turn it holds would be compacted under it), so the
// command queues the built-in /compact with a marker from a timer, and `compact` below answers
// that one compaction instead of the summariser.

export const MARK = '[jev-mod compact: drop only what Jev marks drop]'
let pending = false

export function run(io: IO): { text: string } {
  pending = true
  io.after(0, () => {
    io.runCommand('compact', MARK).catch(() => { pending = false })
  })
  return { text: 'jev-mod compact: asking Jev which turns to drop; nothing will be summarised.' }
}

/** Is this compaction the one /jev-mod compact queued? */
export function isOurs(e: { instructions?: string; agentId?: string }): boolean {
  return pending && !e.agentId && (e.instructions ?? '').includes(MARK)
}

/** The kept messages, or a reason nothing was cut. Never runs the summariser. */
export async function compact(io: IO, messages: readonly any[]): Promise<{ messages: any[] } | { skip: string }> {
  pending = false
  const sent: number[] = []
  const toJev: { role: string; content: string }[] = []
  messages.forEach((m, i) => {
    if (typeof m.text === 'string' && m.text.trim()) { sent.push(i); toJev.push({ role: m.role, content: m.text }) }
  })
  const done = (skip: string) => {
    io.toast(`jev-mod compact: ${skip}.`)
    void activity.count(io, 'compact', 'skipped')
    return { skip }
  }
  if (toJev.length === 0) return done('nothing to judge')
  let out
  try {
    out = await select(hostOf(io), toJev)
  } catch {
    return done('Jev did not answer; nothing was removed')
  }
  await recordCalls(io, out.calls ?? [], out.errors, 'compact')
  if (out.status === 'fail_open') return done('Jev did not answer; nothing was removed')
  const kept = keepOnly(messages, sent, out.fates)
  if (kept.length === messages.length) return done('Jev marked no turn drop; nothing to remove')
  const note = {
    role: 'user',
    text: `[jev-mod compact] Earlier parts of this conversation were removed by a decision model, which kept ` +
      `${kept.length} of ${messages.length} messages and dropped the ones it confidently judged to be chatter, ` +
      `superseded or repeated, or detail nothing later depends on. Everything else was kept as it was. Nothing was summarised. If something you need is ` +
      `missing, ask for it rather than guessing.`,
    toolUses: [],
  }
  void activity.count(io, 'compact', 'compacted')
  io.toast(`jev-mod compact: dropped ${messages.length - kept.length} of ${messages.length} messages, kept ${kept.length}; nothing was summarised.`)
  return { messages: [note, ...kept] }
}
