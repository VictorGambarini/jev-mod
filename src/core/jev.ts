import type { IO } from './io'

// The bridge to the Python `jev` command, while the engine is being ported to TypeScript
// (docs/PORTING.md). Each feature's engine call goes through here until its port lands in
// src/engine/ and passes the parity fixtures; then the call moves there and this shrinks.
//
// Fails open: any failure is null, and starts a cool-off during which nothing is asked, so a
// backend or a `jev` that is down costs one timeout, not one per prompt.

export const COOL_OFF_MS = 5 * 60_000
let quietUntil = 0

export async function jev(io: IO, args: string[], stdin: string, timeoutMs: number): Promise<any> {
  const now = Date.now()
  if (now < quietUntil) return null
  try {
    // A login shell puts ~/.local/bin on PATH however Claude Code was started. The arguments
    // travel through "$@", never through the shell text.
    const ran = await io.run(['/bin/sh', '-lc', 'exec jev "$@"', 'jev', ...args], { stdin, timeoutMs })
    if (ran.exitCode === 0 && ran.stdout.trim()) {
      const out = JSON.parse(ran.stdout)
      if (out?.decision?.error === 'timeout' || out?.decision?.error === 'network') quietUntil = now + COOL_OFF_MS
      return out
    }
    if (ran.exitCode === 0) return null // nothing to say is not a failure
  } catch (error) {
    io.status(`jev: unavailable (${String((error as any)?.message ?? error).slice(0, 80)})`)
  }
  quietUntil = now + COOL_OFF_MS
  return null
}

export function coolingOff(): boolean {
  return Date.now() < quietUntil
}
