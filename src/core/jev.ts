import { costOf, OUTAGES, REFUSED, type Asked } from '../engine/client'
import * as activity from './activity'
import type { IO } from './io'
import * as memory from './memory'

// The session's tally of decision-backend calls, and the cool-off after a failure.
//
// Every engine call is tallied in the session's "jev" namespace for the status line: the
// running cost and call count, the model that answered, and the last failure with when the
// cool-off ends. During a cool-off the features that ask on every prompt (routing, skills) ask
// nothing, so a backend that is down costs one timeout, not one per prompt. A refused key or an
// account out of credit cools off for half an hour, or until a call (/jev-mod status's check
// after the key is replaced) answers again.

export type JevSpace = { cost?: number; calls?: number; error?: string | null; retryAt?: number; model?: string }

export const COOL_OFF_MS = 5 * 60_000
export const REFUSED_COOL_OFF_MS = 30 * 60_000
let quietUntil = 0

export { OUTAGES, REFUSED }

/** The code when it is a failure that starts a cool-off (an outage or a refusal), else null. */
export function failureOf(code: string | null | undefined): string | null {
  return code && (OUTAGES.includes(code) || REFUSED.includes(code)) ? code : null
}

/**
 * One or more backend calls, for the status line: their cost and count added to the session's
 * running total, the model that answered, and the last failure with when its cool-off ends. A
 * failure also starts the cool-off. Named, the feature that asked has them counted as "asked"
 * in its activity (core/activity.ts).
 */
export async function record(io: IO, call: { calls: number; cost: number; error: string | null; model?: string | null; now?: number },
  feature?: string): Promise<void> {
  const now = call.now ?? Date.now()
  const mine = memory.space<JevSpace>('jev')
  mine.calls = (mine.calls ?? 0) + call.calls
  mine.cost = (mine.cost ?? 0) + call.cost
  if (call.model) mine.model = call.model
  const coolOff = call.error !== null && REFUSED.includes(call.error) ? REFUSED_COOL_OFF_MS : COOL_OFF_MS
  mine.error = call.error
  mine.retryAt = call.error === null ? undefined : now + coolOff
  // A call that answered ends any cool-off: the backend (or the replaced key) works again.
  if (call.error !== null) quietUntil = Math.max(quietUntil, now + coolOff)
  else if (call.calls > 0) quietUntil = 0
  await Promise.all([memory.save(io), feature ? activity.count(io, feature, 'asked', call.calls, call.cost, now) : undefined])
}

/** The requests an engine call made (and the error codes of those that failed), recorded as above. */
export async function recordCalls(io: IO, calls: Asked[], errors: string[] = [], feature?: string): Promise<void> {
  const failure = errors.map(failureOf).find(code => code !== null) ?? null
  if (!calls.length && !failure) return
  await record(io, { calls: calls.length + errors.length, cost: calls.reduce((sum, c) => sum + costOf(c), 0),
    error: failure, model: calls.find(c => c.jev_model)?.jev_model }, feature)
}

export function coolingOff(): boolean {
  return Date.now() < quietUntil
}
