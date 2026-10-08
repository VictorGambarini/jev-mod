import { hostOf } from '../../core/host'
import type { IO } from '../../core/io'
import { recordCalls } from '../../core/jev'
import { select } from '../../engine/compact'
import { keepOnly } from './keep'

// /compact-jev: a compaction with no summariser. Jev marks each turn keep / summarize / drop;
// only the turns it marks keep stay (plus the last few and both halves of any kept tool
// call), and what is left is the new context. `/compact` itself is untouched.
//
// A command's own hook may not compact (the turn it holds would be compacted under it), so the
// command queues the built-in /compact with a marker from a timer, and `compact` below answers
// that one compaction instead of the summariser.

export const MARK = '[compact-jev: keep only what Jev marks keep]'
let pending = false

export const command = {
  name: 'compact-jev',
  description: 'Compact with no summary: keep only the turns Jev marks keep (plus the last few)',
}

export function run(io: IO): { text: string } {
  pending = true
  io.after(0, () => {
    io.runCommand('compact', MARK).catch(() => { pending = false })
  })
  return { text: 'compact-jev: asking Jev which turns to keep; nothing will be summarised.' }
}

/** Is this compaction the one /compact-jev queued? */
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
  const done = (skip: string) => { io.toast(`compact-jev: ${skip}.`); return { skip } }
  if (toJev.length === 0) return done('nothing to judge')
  let out
  try {
    out = await select(hostOf(io), toJev)
  } catch {
    return done('Jev did not answer; nothing was removed')
  }
  await recordCalls(io, out.calls ?? [], out.errors)
  if (out.status === 'fail_open') return done('Jev did not answer; nothing was removed')
  if (out.status === 'partial') return done('Jev judged only part of the conversation; nothing was removed')
  const kept = keepOnly(messages, sent, out.fates)
  if (kept.length === messages.length) return done('Jev marked every turn keep; nothing to remove')
  const note = {
    role: 'user',
    text: `[compact-jev] Earlier parts of this conversation were removed by a decision model, which kept ` +
      `${kept.length} of ${messages.length} messages: the ones it judged to carry decisions, constraints, exact ` +
      `values or unfinished work, plus the most recent. Nothing was summarised. If something you need is ` +
      `missing, ask for it rather than guessing.`,
    toolUses: [],
  }
  io.toast(`compact-jev: kept ${kept.length} of ${messages.length} messages; nothing was summarised.`)
  return { messages: [note, ...kept] }
}
