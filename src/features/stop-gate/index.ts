import { hostOf } from '../../core/host'
import * as activity from '../../core/activity'
import { inBackground } from '../../core/background'
import { setting } from '../../core/config'
import type { IO } from '../../core/io'
import { coolingOff, recordCalls } from '../../core/jev'
import { limitsOf } from '../../core/limits'
import { isPrivate, jevDir } from '../../core/settings'
import { ask, costOf, JevError } from '../../engine/client'
import { isSensitive, redact } from '../../engine/privacy'
import {
  actedAfter, answersOf, claims, decide, decideShort, evidence, isConsequential, keepIds, mayNudge, nudge, nudged, questionsOf, requestIndex,
  shortAnswersOf, shortQuestions, shortStateOf, stateOf, stopShortNote, unfinishedStep, unverifiedNote, type Cap, type Pending, type Verdict,
} from './gate'

// The completion gate: when the main agent ends a turn (the settings Stop event: a normal end,
// never an interrupt or an API error, never a subagent), and its final message claims the work
// is done, Jev judges whether the turn's evidence shows it: shown, not shown, or could not tell.
// In "on", an unshown claim sends the agent back once more with a short note naming it (Stop's
// block); a claim the gate could not judge sends it back only to say it is unverified. A turn
// that ends on a promise of the next step, or asks leave for work the person already asked for,
// is sent back to do it or say why it stopped, unless the step is hard to undo. All of these
// share the cap of maxNudges per prompt; in "shadow" the judgement is only counted. Anything that
// goes wrong lets it stop.

const ID = 'stop-gate'
const TIMEOUT_MS = 6000

let cap: Cap = { key: null, given: 0 }
let prompts = 0

/** A new prompt from the person (not a continuation): the nudge count starts again. */
export function turnStarted(text: string): void {
  if (text.trim()) prompts++
}

/**
 * The note that sends the agent back, or null to let it stop. In shadow the judgement runs in
 * the background and is only counted: the agent is never stopped, so it never waits for it.
 */
export async function check(io: IO, e: { promptId?: string; last?: string }): Promise<string | null> {
  try {
    const { mode, knobs } = await setting(io, ID)
    if (mode === 'off') return null
    const final = e.last ?? ''
    const found = claims(final)
    const pending = unfinishedStep(final)
    if (!found.length && !pending) return null // nothing to judge, and nothing counted
    const knob = (name: string, fallback: number) => Number(knobs[name]?.value ?? fallback)
    // A hard-to-undo step is never what the agent is sent back to do: counted, not asked.
    const open = pending && !isConsequential(pending.step) ? pending : null
    if (pending && !open) await activity.count(io, ID, 'step-held')
    if (mode !== 'on') {
      inBackground(async () => {
        if (open && await judgeShort(io, final, open, knob, true)) return
        if (found.length) await judge(io, final, found, knob, true)
      })
      return null
    }
    if (!open && !found.length) return null
    const key = e.promptId ?? `prompt-${prompts}`
    if (!mayNudge(cap, key, knob('maxNudges', 2))) { await activity.count(io, ID, 'capped'); return null }
    if (open && await judgeShort(io, final, open, knob, false)) {
      cap = nudged(cap, key)
      await activity.count(io, ID, 'continued')
      io.toast('jev-mod: the turn stopped short of a step you asked for; the agent was asked to do it')
      return stopShortNote(open)
    }
    if (!found.length) return null
    const verdict = await judge(io, final, found, knob, false)
    if (!verdict) return null
    cap = nudged(cap, key)
    if (verdict.verdict === 'could-not-tell') {
      await activity.count(io, ID, 'noted')
      io.toast('jev-mod: a completion claim could not be checked; the agent was asked to say it is unverified')
      return unverifiedNote(verdict)
    }
    await activity.count(io, ID, 'nudged')
    io.toast('jev-mod: an unshown completion claim; the agent was asked to verify it')
    return nudge(verdict)
  } catch {
    return null
  }
}

/**
 * One question to Jev, with the guards every decision has: cool-off, private mode, a secret in
 * the text, the daily budget. The answers, or null (counted as skipped) when it was not asked or not answered.
 */
async function consult(io: IO, raw: string[], state: unknown, questions: Record<string, unknown>, shadow: boolean) {
  const outcome = (name: string) => activity.count(io, ID, name)
  if (coolingOff() || await isPrivate(io, await jevDir(io))) { await outcome('skipped'); return null }
  if (isSensitive(raw.join('\n'))) { await outcome('skipped'); return null } // redaction is a backstop, not a licence
  const limits = await limitsOf(io)
  if (limits && !(await limits.admit(shadow))[0]) { await outcome('skipped'); return null }
  let reply
  try {
    reply = await ask(hostOf(io), state, questions, { timeoutMs: TIMEOUT_MS })
  } catch (error) {
    await recordCalls(io, [], [error instanceof JevError ? error.code : 'network'], ID)
    await outcome('skipped')
    return null
  }
  await recordCalls(io, [reply], [], ID)
  if (limits) await limits.charge(costOf(reply))
  return reply.answers
}

/** Did the turn stop short of `pending`: asked for, left undone, and no real question? Counted here: continued is the caller's. */
async function judgeShort(io: IO, final: string, pending: Pending, knob: (name: string, fallback: number) => number, shadow: boolean): Promise<boolean> {
  const messages = await io.messages()
  if (actedAfter(messages, pending.sentence)) { await activity.count(io, ID, 'passed'); return false }
  const at = requestIndex(messages)
  const request = at >= 0 ? messages[at]!.text : ''
  const answers = await consult(io, [request, final], shortStateOf(request, final, pending, redact), shortQuestions(), shadow)
  if (!answers) return false
  const read = shortAnswersOf(answers)
  if (!read) { await activity.count(io, ID, 'skipped'); return false }
  if (!decideShort(read, knob('minConfidence', 0.7)).short) { await activity.count(io, ID, 'passed'); return false }
  if (shadow) await activity.count(io, ID, 'would-continue')
  return true
}

/**
 * The verdict on a turn's claims when it asks for a note (not shown, could not tell), else null.
 * Every verdict is counted here (shown, not-shown, could-not-tell); what is done about it is the caller's, and in shadow counted here.
 */
async function judge(io: IO, final: string, found: ReturnType<typeof claims>, knob: (name: string, fallback: number) => number,
  shadow: boolean): Promise<Exclude<Verdict, { verdict: 'none' | 'shown' }> | null> {
  const outcome = (name: string) => activity.count(io, ID, name)
  const messages = await io.messages()
  const at = requestIndex(messages)
  const request = at >= 0 ? messages[at]!.text : ''
  const ev = evidence(messages, knob('evidenceChars', 6000))
  const raw = [request, final, ...ev.edited_files, ...ev.commands.flatMap(c => [c.command, c.output])]
  const answers = await consult(io, raw, stateOf(request, final, found, ev, keepIds(redact)), questionsOf(found), shadow)
  if (!answers) return null
  const read = answersOf(answers, found)
  if (!read) { await outcome('skipped'); return null }
  const verdict = decide(read, found, knob('minConfidence', 0.7), ev.cut)
  if (verdict.verdict === 'none') { await outcome('no-claim'); return null }
  await outcome(verdict.verdict)
  if (verdict.verdict === 'shown') return null
  if (shadow) { await outcome(verdict.verdict === 'not-shown' ? 'would-nudge' : 'would-note'); return null }
  return verdict
}
