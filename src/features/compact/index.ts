import { dropConfidence, ledgerCompaction } from '../../core/bench-overlay'
import { hostOf } from '../../core/host'
import * as activity from '../../core/activity'
import type { IO } from '../../core/io'
import { recordCalls } from '../../core/jev'
import { limitsOf } from '../../core/limits'
import { isPrivate, jevDir } from '../../core/settings'
import { costOf, type Asked } from '../../engine/client'
import { select, trim, type Selection, type Trimming } from '../../engine/compact'
import { folderFor, prune, save } from './files'
import { cut, keepOnly, placeholder, saved, trimmed, trimsOf, unitsOf, type Msg } from './keep'

// /jev-mod compact: a compaction with no summariser. Old tool results, where the tokens are, are
// trimmed: for each tool call with its result outside the last few messages, the call stays as it
// is, the full call and result are saved to a file Claude can Read, and the result keeps only the
// start and end Jev says later work needs (0, 100, 300 or 600 characters of each), with a line
// where the middle was naming the file. Messages with no tool call or result are kept or dropped:
// one goes only when Jev confidently marked its text drop. In doubt, more is kept: a low-confidence
// trim keeps 600 of that end; a pair Jev did not judge (Jev down, a partial answer, a result too
// short to bother, too sensitive to send, or in the tail) stays whole and is not saved; a text Jev
// did not judge stays. Nothing is summarised. `/compact` itself is untouched.
//
// A command's own hook may not compact (the turn it holds would be compacted under it; the host
// refuses it), so the command queues the built-in /compact with a marker from a timer, and
// `compact` below answers that one compaction instead of the summariser. `/compact` with the
// marker as its instructions runs the same compaction in one step, which is how a headless run
// (`claude -p`) does it: that process ends when the command returns, before any timer fires.

export const MARK = '[jev-mod compact: drop only what Jev marks drop]'
let pending = false

/** `origin`: where the command came from (command.run's); `sdk` is a headless run or an SDK host. */
export function run(io: IO, origin?: { kind: string }): { text: string } {
  pending = true
  io.after(0, () => {
    io.runCommand('compact', MARK).catch(() => { pending = false })
  })
  const text = 'jev-mod compact: asking Jev what to drop and how far to trim old tool results; nothing will be summarised.'
  if (origin?.kind !== 'sdk') return { text }
  return { text: `${text} A \`claude -p\` run ends before that starts: there, run \`/compact ${MARK}\` instead, ` +
    'the same compaction in one step.' }
}

/**
 * Is this compaction /jev-mod compact's: the one the command queued, or a `/compact` typed (or
 * sent headless) with the marker as its instructions? Never a subagent's, nor an automatic one.
 */
export function isOurs(e: { instructions?: string; agentId?: string; trigger?: string }): boolean {
  if (e.agentId || !(e.instructions ?? '').includes(MARK)) return false
  return pending || e.trigger === 'manual'
}

/** The note that stands first in the compacted conversation: what was cut, and where the files are. */
export function noteText(o: { messages: number; dropped: number; trimmed: number; folder: string | null }): string {
  const parts = ['[jev-mod compact] Earlier parts of this conversation were cut by a decision model; nothing was summarised.']
  if (o.dropped) {
    parts.push(`It dropped ${o.dropped} of ${o.messages} messages whose text it confidently judged to be chatter, superseded ` +
      'or repeated, or detail nothing later depends on.')
  }
  if (o.trimmed && o.folder) {
    parts.push(`It trimmed ${o.trimmed} old tool results to the start and end it judged later work needs. Every tool call is ` +
      'still here as it was; each trimmed result says where it was cut and names the file that holds the full call and result, ' +
      `one file per call, in ${o.folder}. Read a file when you need what was cut.`)
  }
  parts.push('Everything else, including anything it did not judge, was kept as it was. If something you need is missing, ' +
    'read its file or ask for it rather than guessing.')
  return parts.join(' ')
}

/** The kept messages, or a reason nothing was cut. Never runs the summariser. */
export async function compact(io: IO, messages: readonly any[]): Promise<{ messages: any[] } | { skip: string }> {
  pending = false
  const { units, toJev } = unitsOf(messages)
  const { pairs, views } = trimsOf(messages)
  // a bench run's ledger gets what each compaction kept, dropped and trimmed (core/bench-overlay.ts)
  const done = async (skip: string) => {
    io.toast(`jev-mod compact: ${skip}.`)
    void activity.count(io, 'compact', 'skipped')
    await ledgerCompaction(io, { messages: messages.length, kept: messages.length, dropped: 0, skip })
    return { skip }
  }
  if (toJev.length === 0 && views.length === 0) return done('nothing to judge')
  if (await isPrivate(io, await jevDir(io)).catch(() => true)) return done('this profile is private, so nothing is sent; nothing was removed')
  // One compaction against the daily budget, its batches charged together.
  const limits = await limitsOf(io)
  if (limits && !(await limits.admit(false))[0]) return done("today's budget is spent; nothing was removed")
  let texts: Selection | null = null
  let trims: Trimming | null = null
  try {
    // the tail is kept by message, in keep.ts; a bench run may set the confidence bar (core/bench-overlay.ts)
    const bench = await dropConfidence(io)
    const host = hostOf(io)
    ;[texts, trims] = await Promise.all([
      toJev.length ? select(host, toJev, { keepLast: 0, ...(bench === undefined ? {} : { dropConfidence: bench }) }) : null,
      views.length ? trim(host, views, bench === undefined ? {} : { confidence: bench }) : null,
    ])
  } catch {
    return done('Jev did not answer; nothing was removed')
  }
  // the keep-or-drop and the trim decisions are recorded apart, each with its batches
  const calls: Asked[] = [...(texts?.calls ?? []), ...(trims?.calls ?? [])]
  await Promise.all([recordCalls(io, texts?.calls ?? [], texts?.errors ?? [], 'compact'),
    recordCalls(io, trims?.calls ?? [], trims?.errors ?? [], 'compact'),
    limits?.charge(calls.reduce((sum, c) => sum + costOf(c), 0))])
  const answered = (s: { status: string } | null) => !!s && s.status !== 'fail_open'
  if (!answered(texts) && !answered(trims)) return done('Jev did not answer; nothing was removed')

  // each result Jev trimmed, saved in full first: a pair whose file could not be written stays whole
  const planned = new Map<string, { head: number; tail: number }>()
  pairs.forEach((p, i) => {
    const t = trims?.trims[String(i)]
    if (t && t.head + t.tail < views[i]!.size) planned.set(p.id, t)
  })
  const where = planned.size ? await folderFor(io) : null
  const files = where
    ? await save(io, where, new Map(pairs.filter(p => planned.has(p.id)).map(p => [p.id, saved(p, where.session)])))
    : new Map<string, string>()
  const newTexts = new Map<string, string>()
  let charsRemoved = 0
  for (const p of pairs) {
    const t = planned.get(p.id)
    const file = files.get(p.id)
    if (!t || !file) continue
    const text = cut(p.text, t.head, t.tail, placeholder(p, t.head, t.tail, file))
    if (text === null) continue
    newTexts.set(p.id, text)
    charsRemoved += [...p.text].length - [...text].length
  }
  if (where) void prune(io, where.root, where.session)

  const kept = keepOnly(messages as Msg[], units, texts?.fates ?? {})
  const dropped = messages.length - kept.length
  if (!dropped && !newTexts.size) return done('Jev marked nothing to drop or trim; nothing to remove')
  const note = {
    role: 'user',
    text: noteText({ messages: messages.length, dropped, trimmed: newTexts.size, folder: where?.dir ?? null }),
    toolUses: [],
  }
  void activity.count(io, 'compact', 'compacted')
  await ledgerCompaction(io, { messages: messages.length, kept: kept.length, dropped, skip: null,
    trimmed: newTexts.size, charsRemoved, files: files.size })
  const trimmedNote = newTexts.size ? `, trimmed ${newTexts.size} tool results (${Math.round(charsRemoved / 1000)}k characters, saved in full)` : ''
  io.toast(`jev-mod compact: dropped ${dropped} of ${messages.length} messages${trimmedNote}; nothing was summarised.`)
  return { messages: [note, ...trimmed(kept, newTexts)] }
}
