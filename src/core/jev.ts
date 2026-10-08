import { costOf, type Asked } from '../engine/client'
import type { IO } from './io'
import * as memory from './memory'

// The session's tally of decision-backend calls, and the cool-off after a failure.
//
// Every engine call is tallied in the session's "jev" namespace for the status line: the
// running cost and call count, the model that answered, and the last failure with when the
// cool-off ends. During a cool-off the features that ask on every prompt (routing, skills) ask
// nothing, so a backend that is down costs one timeout, not one per prompt.

export type JevSpace = { cost?: number; calls?: number; error?: string | null; retryAt?: number; model?: string }

export const COOL_OFF_MS = 5 * 60_000
let quietUntil = 0

/**
 * One or more backend calls, for the status line: their cost and count added to the session's
 * running total, the model that answered, and the last failure with when its cool-off ends. A
 * failure also starts the cool-off.
 */
export async function record(io: IO, call: { calls: number; cost: number; error: string | null; model?: string | null; now?: number }): Promise<void> {
  const now = call.now ?? Date.now()
  const mine = memory.space<JevSpace>('jev')
  mine.calls = (mine.calls ?? 0) + call.calls
  mine.cost = (mine.cost ?? 0) + call.cost
  if (call.model) mine.model = call.model
  mine.error = call.error
  mine.retryAt = call.error === null ? undefined : now + COOL_OFF_MS
  if (call.error !== null) quietUntil = Math.max(quietUntil, now + COOL_OFF_MS)
  await memory.save(io)
}

// An outage starts the cool-off; a refusal (a bad key, a malformed reply) is the request's own fault.
export const OUTAGES = ['network', 'timeout', 'http_502', 'http_503', 'http_504']

/** The requests an engine call made (and the error codes of those that failed), recorded as above. */
export async function recordCalls(io: IO, calls: Asked[], errors: string[] = []): Promise<void> {
  const failure = errors.find(code => OUTAGES.includes(code)) ?? null
  if (!calls.length && !failure) return
  await record(io, { calls: calls.length + errors.length, cost: calls.reduce((sum, c) => sum + costOf(c), 0),
    error: failure, model: calls.find(c => c.jev_model)?.jev_model })
}

export function coolingOff(): boolean {
  return Date.now() < quietUntil
}
