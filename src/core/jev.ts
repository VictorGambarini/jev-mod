import { costOf, type Asked } from '../engine/client'
import type { IO } from './io'
import * as memory from './memory'

// The bridge to the Python `jev` command, while the engine is being ported to TypeScript
// (docs/PORTING.md). Each feature's engine call goes through here until its port lands in
// src/engine/ and passes the parity fixtures; then the call moves there and this shrinks.
//
// Fails open: any failure is null, and starts a cool-off during which nothing is asked, so a
// backend or a `jev` that is down costs one timeout, not one per prompt.
//
// Every call is also tallied in the session's "jev" namespace for the status line: the
// running cost and call count, and the last failure with when the cool-off ends.

export type JevSpace = { cost?: number; calls?: number; error?: string | null; retryAt?: number; model?: string }

export const COOL_OFF_MS = 5 * 60_000
let quietUntil = 0

export async function jev(io: IO, args: string[], stdin: string, timeoutMs: number): Promise<any> {
  const now = Date.now()
  if (now < quietUntil) return null
  let out: any = null
  let error: string | null = null
  try {
    // A login shell puts ~/.local/bin on PATH however Claude Code was started. The arguments
    // travel through "$@", never through the shell text.
    const ran = await io.run(['/bin/sh', '-lc', 'exec jev "$@"', 'jev', ...args], { stdin, timeoutMs })
    if (ran.exitCode === 0 && ran.stdout.trim()) {
      out = JSON.parse(ran.stdout)
      const failed = out?.decision?.error
      if (failed === 'timeout' || failed === 'network') error = String(failed)
    } else if (ran.exitCode !== 0) {
      error = `exit ${ran.exitCode}`
    }
  } catch (caught) {
    error = String((caught as any)?.message ?? caught).slice(0, 80)
    io.status(`jev: unavailable (${error})`)
  }
  if (error !== null) quietUntil = now + COOL_OFF_MS
  await tally(io, out, error, now)
  return out
}

async function tally(io: IO, out: any, error: string | null, now: number): Promise<void> {
  const cost = Number(out?.decision?.cost_usd ?? out?.cost_usd)
  await record(io, { calls: 1, cost: Number.isFinite(cost) ? cost : 0, error, now })
}

/**
 * One or more backend calls, for the status line: their cost and count added to the session's
 * running total, the model that answered, and the last failure with when its cool-off ends. A
 * failure also starts the cool-off here, whichever path (CLI or engine) made the call.
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
const OUTAGES = ['network', 'timeout', 'http_502', 'http_503', 'http_504']

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
