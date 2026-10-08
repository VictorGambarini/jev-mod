import type { Activity } from '../../core/activity'
import { beneathProject, killedBy, resolve, type Resolved, type Scope, type Snapshot, type Source } from '../../core/config'
import type { Feature, KnobValue, Mode } from '../../core/registry'

// What the dashboard page is drawn from, and what the server says on stdout. Pure: the facts in,
// the state file's JSON out; a line in, a message out. Every feature in the registry, with its
// knobs, is in the state with nothing written here for it, so a feature added later appears.
//
// Nothing here ever holds a key: the backend part says only which backend, and where its key
// came from.

export type KnobView = {
  name: string
  type: 'int' | 'number' | 'boolean' | 'choice'
  title: string
  help: string
  default: KnobValue
  min?: number
  max?: number
  options?: readonly string[]
}

export type FeatureView = {
  id: string
  title: string
  summary: string
  help: string
  modes: readonly Mode[]
  default: Mode
  knobs: KnobView[]
  /** What holds now, and which layer said so. */
  resolved: { mode: Mode; source: Source; knobs: Record<string, { value: KnobValue; source: Source }> }
  /** What each scope's file says for this feature, as written (unchecked). */
  files: Partial<Record<Scope, Record<string, unknown>>>
  /** Kill files present that turn it off. */
  killedBy: string[]
  /**
   * A protective feature's least strict mode the project file may set (what the layers beneath
   * it give), or null for any other feature: a project may tighten it, never loosen it.
   */
  projectFloor: Mode | null
}

export type ActivityView = {
  /** The days shown, oldest first: "2026-10-09". */
  days: string[]
  /** feature -> outcome -> a count per day, in `days` order. `cost` is kept apart. */
  counts: Record<string, Record<string, number[]>>
  /** feature -> dollars per day. */
  cost: Record<string, number[]>
}

export type Answer = { ok: true; message?: string } | { ok: false; error: string }

export type BackendView = {
  /** A named backend (backends.json), or Jev through a provider. */
  name: string | null
  model: string | null
  provider: string
  /** Where its key came from: environment, settings, keychain, file, none. Never the key. */
  keySource: string
  misconfigured: string | null
  private: boolean
}

export type State = {
  version: string
  seq: number
  /** When this was written (ms); the server asks for a fresh one once it is a few seconds old. */
  at: number
  mode: 'live' | 'static'
  paths: Partial<Record<Scope, string>>
  /** /config's "jev-mod on" unticked: every feature off. */
  disabled: boolean
  problems: string[]
  features: FeatureView[]
  activity: ActivityView
  budget: { day: string; spent: number; daily: number } | null
  backend: BackendView | null
  /** The last few changes the page asked for, by the server's op id. */
  answered: Record<string, Answer>
}

export type Facts = {
  version: string
  seq: number
  now: number
  mode: 'live' | 'static'
  features: readonly Feature[]
  snap: Snapshot
  problems: string[]
  paths: Partial<Record<Scope, string>>
  activity: Activity
  days: string[]
  budget: State['budget']
  backend: BackendView | null
  answered: Record<string, Answer>
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function knobView(name: string, k: Feature['knobs'][string]): KnobView {
  const base = { name, type: k.type, title: k.title, help: k.help, default: k.default }
  if (k.type === 'int' || k.type === 'number') return { ...base, min: k.min, max: k.max }
  if (k.type === 'choice') return { ...base, options: k.options }
  return base
}

function filesOf(snap: Snapshot, id: string): FeatureView['files'] {
  const out: FeatureView['files'] = {}
  for (const scope of ['user', 'project'] as const) {
    const file = snap.files[scope]
    if (!isObject(file) || !isObject(file.features)) continue
    const mine = file.features[id]
    if (isObject(mine)) out[scope] = { ...mine }
  }
  return out
}

/** The activity of `days`, each feature's outcomes as a row of daily counts. */
export function activityView(all: Activity, days: string[]): ActivityView {
  const counts: ActivityView['counts'] = {}
  const cost: ActivityView['cost'] = {}
  days.forEach((day, i) => {
    for (const [id, outcomes] of Object.entries(all[day] ?? {})) {
      for (const [outcome, n] of Object.entries(outcomes)) {
        if (typeof n !== 'number' || !Number.isFinite(n)) continue
        const row = outcome === 'cost' ? (cost[id] ??= days.map(() => 0)) : ((counts[id] ??= {})[outcome] ??= days.map(() => 0))
        row[i] = (row[i] ?? 0) + n
      }
    }
  })
  return { days, counts, cost }
}

/** The `n` local days ending with `now`'s, oldest first. */
export function lastDays(now: number, n: number, dayOf: (ms: number) => string): string[] {
  const out: string[] = []
  for (let back = n - 1; back >= 0; back--) {
    const d = new Date(now)
    d.setDate(d.getDate() - back)
    out.push(dayOf(d.getTime()))
  }
  return out
}

export function build(f: Facts): State {
  const enabled = f.snap.options.enabled
  return {
    version: f.version,
    seq: f.seq,
    at: f.now,
    mode: f.mode,
    paths: f.paths,
    disabled: enabled === false || enabled === 'false',
    problems: f.problems,
    features: f.features.map(feat => {
      const resolved: Resolved = resolve(f.snap, feat)
      return {
        id: feat.id, title: feat.title, summary: feat.summary, help: feat.help, modes: feat.modes, default: feat.default,
        knobs: Object.entries(feat.knobs).map(([name, k]) => knobView(name, k)),
        resolved, files: filesOf(f.snap, feat.id), killedBy: killedBy(f.snap, feat),
        projectFloor: feat.protective ? beneathProject(f.snap, feat).mode : null,
      }
    }),
    activity: activityView(f.activity, f.days),
    budget: f.budget,
    backend: f.backend,
    answered: f.answered,
  }
}

/** The state as JSON a <script> can hold: no "</script>" or "<!--" can end it early. */
export function embed(state: State): string {
  return JSON.stringify(state).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

// ---- what the server says ----

export type Op =
  | { id: string; op: 'set'; scope: Scope; feature: string; key: string; value: string | number | boolean | null }
  | { id: string; op: 'reset'; scope: Scope; feature: string }

export type Message =
  | { kind: 'ready'; port: number; token: string; pid: number }
  | { kind: 'refresh' }
  | { kind: 'op'; op: Op }
  | { kind: 'bad'; id: string; problem: string }

/** One line of the server's stdout, read and checked against the registry; null when it is noise. */
export function readLine(line: string, features: readonly Feature[]): Message | null {
  let v: unknown
  try { v = JSON.parse(line) } catch { return null }
  if (!isObject(v)) return null
  if (v.ready === true) {
    const { port, token, pid } = v
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return null
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null
    return { kind: 'ready', port, token, pid: typeof pid === 'number' && Number.isInteger(pid) ? pid : 0 }
  }
  if (v.op === 'refresh' && v.id === undefined) return { kind: 'refresh' }
  if (typeof v.id !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(v.id)) return null
  const id = v.id
  const bad = (problem: string): Message => ({ kind: 'bad', id, problem })
  if (v.op !== 'set' && v.op !== 'reset') return bad('op must be set or reset')
  if (v.scope !== 'user' && v.scope !== 'project') return bad('scope must be user or project')
  const f = features.find(x => x.id === v.feature)
  if (!f) return bad(`no feature ${String(v.feature)}`)
  if (v.op === 'reset') return { kind: 'op', op: { id, op: 'reset', scope: v.scope, feature: f.id } }
  const key = v.key
  if (typeof key !== 'string' || (key !== 'mode' && !(key in f.knobs))) return bad(`${f.id} has no setting ${String(key)}`)
  const value = v.value
  if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) return bad('a value must be a string, number, boolean or null')
  if (key === 'mode' && value === null) return bad('a mode cannot be cleared on its own; reset the feature')
  return { kind: 'op', op: { id, op: 'set', scope: v.scope, feature: f.id, key, value: value as string | number | boolean | null } }
}

/** Whole lines out of what has come so far; the unfinished rest kept (and dropped past 64 KB). */
export function lines(rest: string, piece: string): { lines: string[]; rest: string } {
  const all = (rest + piece).split('\n')
  const left = all.pop() ?? ''
  return { lines: all.filter(l => l.trim()), rest: left.length > 65536 ? '' : left }
}

/** The answers kept for the server to find: the newest `keep`. */
export function remember(answered: Record<string, Answer>, id: string, answer: Answer, keep = 20): Record<string, Answer> {
  const entries = [...Object.entries(answered).filter(([k]) => k !== id), [id, answer] as [string, Answer]]
  return Object.fromEntries(entries.slice(-keep))
}

/** The page with its boot data in place of the marker. */
export function pageWith(html: string, boot: unknown): string {
  const data = typeof boot === 'string' ? boot : JSON.stringify(boot).replace(/</g, '\\u003c')
  return html.replace('/*__BOOT__*/null', () => data)
}
