import type { IO } from './io'

// What each feature did, or in shadow would have done, counted by local day, so the dashboard
// and `/jev-mod` can show it. Kept in the mod's store beside the sessions:
//
//   store["activity"]["2026-10-09"] = { skills: { asked: 3, suggested: 1, cost: 0.00006 }, ... }
//
// Counts gather in this process and are written one after another, so features counting at
// once (routing and skills at submit) never lose one; a write that fails is dropped: counts are
// for showing, never for deciding.

export type Counts = Record<string, number> // outcome -> times; `cost` -> dollars
export type Activity = Record<string, Record<string, Counts>> // day -> feature -> counts

const KEY = 'activity'
export const KEEP_DAYS = 30

let pending: Activity = {}
let writing: Promise<void> = Promise.resolve()

/** The local day of a moment, as lanes.ts's budget counts it: "2026-10-09". */
export function dayOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The day `back` days before the one `ms` falls on. */
function daysBefore(ms: number, back: number): string {
  const d = new Date(ms)
  d.setDate(d.getDate() - back)
  return dayOf(d.getTime())
}

/** `from` added into `into`, in place. Pure but for `into`. */
export function merge(into: Activity, from: Activity): Activity {
  for (const [day, features] of Object.entries(from)) {
    into[day] ??= {}
    for (const [id, counts] of Object.entries(features)) {
      into[day][id] ??= {}
      for (const [outcome, n] of Object.entries(counts)) into[day][id][outcome] = (into[day][id][outcome] ?? 0) + n
    }
  }
  return into
}

/** The days from `days` - 1 days before `now` to `now`'s own, the rest left out. */
export function within(all: Activity, days: number, now: number): Activity {
  const first = daysBefore(now, Math.max(days, 1) - 1)
  return Object.fromEntries(Object.entries(all).filter(([day]) => day >= first).sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * Count one outcome of a feature (`n` times), and what its backend calls cost. Resolves once
 * it is written; a caller in a hurry need not wait.
 */
export function count(io: IO, featureId: string, outcome: string, n = 1, costUsd = 0, now = Date.now()): Promise<void> {
  const counts: Counts = { [outcome]: n }
  if (costUsd) counts.cost = costUsd
  merge(pending, { [dayOf(now)]: { [featureId]: counts } })
  writing = writing.then(() => flush(io, now))
  return writing
}

async function flush(io: IO, now: number): Promise<void> {
  if (!Object.keys(pending).length) return
  const taken = pending
  pending = {}
  try {
    const stored = await io.storeGet(KEY)
    const all = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored as Activity : {}
    await io.storeSet(KEY, within(merge(all, taken), KEEP_DAYS, now))
  } catch { /* counts are for showing */ }
}

/** The last `days` days (today included), oldest first: { day: { featureId: { outcome: n, cost } } }. */
export async function activity(io: IO, days = 7, now = Date.now()): Promise<Activity> {
  await writing
  try {
    const stored = await io.storeGet(KEY)
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    return within(stored as Activity, days, now)
  } catch {
    return {}
  }
}
