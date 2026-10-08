import type { IO } from './io'

// Per-session memory, one namespace per feature, kept in the mod's store so `--continue`,
// `--resume` and restarts carry on where the session was. The status line reads the same
// record: a feature's namespace is also what it shows.
//
//   store["sessions"][sessionId] = { at, features: { routing: {...}, skills: {...}, ... } }

const KEY = 'sessions'
const KEEP_SESSIONS = 50

type Record_ = { at: number; features: Record<string, Record<string, unknown>> }

let loadedFor: string | null = null
let features: Record<string, Record<string, unknown>> = {}

/** Load this session's record once per session; true the first time a session is seen here. */
export async function load(io: IO): Promise<boolean> {
  let id: string | null = null
  try { id = await io.sessionId() } catch { id = null }
  if (id === null || id === loadedFor) return false
  loadedFor = id
  try {
    const all = (await io.storeGet(KEY)) as Record<string, Record_> | undefined
    features = structuredCloneSafe(all?.[id]?.features ?? {})
  } catch {
    features = {}
  }
  return true
}

/** A feature's namespace for this session, created empty. Mutate it, then `save`. */
export function space<T extends Record<string, unknown>>(feature: string): T {
  features[feature] ??= {}
  return features[feature] as T
}

/** A copy of this session's features, for drawing. */
export function snapshot(): Record<string, Record<string, unknown>> {
  return JSON.parse(JSON.stringify(features))
}

export function session(): string | null {
  return loadedFor
}

export async function save(io: IO): Promise<void> {
  if (loadedFor === null) return
  try {
    const all = ((await io.storeGet(KEY)) as Record<string, Record_> | undefined) ?? {}
    all[loadedFor] = { at: Date.now(), features }
    const newest = Object.entries(all).sort(([, a], [, b]) => b.at - a.at).slice(0, KEEP_SESSIONS)
    await io.storeSet(KEY, Object.fromEntries(newest))
  } catch {
    // the in-process copy still holds for the rest of this process
  }
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
