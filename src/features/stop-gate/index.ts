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
import { answersOf, claims, decide, evidence, keepIds, mayNudge, nudge, nudged, questionsOf, requestIndex, stateOf, type Cap, type Verdict } from './gate'

// The completion gate: when the main agent ends a turn (the settings Stop event: a normal end,
// never an interrupt or an API error, never a subagent), and its final message claims the work
// is done, Jev judges whether the turn's evidence shows it. In "on", an unshown claim sends the
// agent back once more with a short note naming it (Stop's block), at most maxNudges times per
// prompt; in "shadow" the judgement is only counted. Anything that goes wrong lets it stop.

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
    if (!found.length) return null // no claim: nothing to judge, and nothing counted
    const knob = (name: string, fallback: number) => Number(knobs[name]?.value ?? fallback)
    if (mode !== 'on') {
      inBackground(() => judge(io, final, found, knob, true))
      return null
    }
    const key = e.promptId ?? `prompt-${prompts}`
    if (!mayNudge(cap, key, knob('maxNudges', 2))) { await activity.count(io, ID, 'capped'); return null }
    const verdict = await judge(io, final, found, knob, false)
    if (!verdict) return null
    cap = nudged(cap, key)
    await activity.count(io, ID, 'nudged')
    io.toast('jev-mod: an unshown completion claim; the agent was asked to verify it')
    return nudge(verdict)
  } catch {
    return null
  }
}

/** The judgement on a turn's claims when it says one is unshown, else null; every outcome but the nudge counted here. */
async function judge(io: IO, final: string, found: ReturnType<typeof claims>, knob: (name: string, fallback: number) => number,
  shadow: boolean): Promise<Extract<Verdict, { nudge: true }> | null> {
  const outcome = (name: string) => activity.count(io, ID, name)
  if (coolingOff() || await isPrivate(io, await jevDir(io))) { await outcome('skipped'); return null }
  const messages = await io.messages()
  const at = requestIndex(messages)
  const request = at >= 0 ? messages[at]!.text : ''
  const ev = evidence(messages, knob('evidenceChars', 6000))
  const raw = [request, final, ...ev.edited_files, ...ev.commands.flatMap(c => [c.command, c.output])].join('\n')
  if (isSensitive(raw)) { await outcome('skipped'); return null } // redaction is a backstop, not a licence

  const limits = await limitsOf(io)
  if (limits && !(await limits.admit(shadow))[0]) { await outcome('skipped'); return null }
  let reply
  try {
    reply = await ask(hostOf(io), stateOf(request, final, found, ev, keepIds(redact)), questionsOf(found), { timeoutMs: TIMEOUT_MS })
  } catch (error) {
    await recordCalls(io, [], [error instanceof JevError ? error.code : 'network'], ID)
    await outcome('skipped')
    return null
  }
  await recordCalls(io, [reply], [], ID)
  if (limits) await limits.charge(costOf(reply))
  const answers = answersOf(reply.answers, found)
  if (!answers) { await outcome('skipped'); return null }
  const verdict = decide(answers, found, knob('minConfidence', 0.7))
  if (!verdict.nudge) { await outcome('passed'); return null }
  if (shadow) { await outcome('would-nudge'); return null }
  return verdict
}
