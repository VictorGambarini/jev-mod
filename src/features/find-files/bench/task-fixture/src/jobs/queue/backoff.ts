// Delay before a failed background job is run again: 30s, 2m, 10m, then every hour, with up to 20% jitter.
const STEPS_MS = [30_000, 120_000, 600_000]

export function jobBackoffMs(attempt: number, random = Math.random): number {
  const base = STEPS_MS[attempt - 1] ?? 3_600_000
  return Math.round(base * (1 + random() * 0.2))
}
