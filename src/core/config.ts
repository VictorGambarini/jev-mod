import { hostOf } from './host'
import type { IO } from './io'
import { jevDir } from './settings'
import { checkKnob, checkMode, feature, FEATURES, strictness, type Feature, type KnobValue, type Mode } from './registry'

// Which features are on and how they are set, from (first that says wins):
//
//   1. a kill file:     <jev-mod dir>/OFF (everything), <jev-mod dir>/<ID>_OFF, or jev-skills' <jev dir>/<KEY>_OFF
//   2. /config:         "jev-mod on" (enabled) unticked turns every feature off
//   3. the project:     <project>/.claude/jev-mod.json; for a protective feature (screening, the
//                       gates) only a mode stricter than 4-6 give, and none of its knobs; for a
//                       risky one (the browser) only a mode lower than 4-6 give, and none of its knobs
//   4. the user:        ~/.config/jev-mod/config.json (XDG_CONFIG_HOME respected)
//   5. older switches:  a /config field set away from its default, then jev-skills' state.json
//   6. the feature's default (registry.ts)
//
// Both files look like {"features": {"skills": {"mode": "shadow", "<knob>": <value>}}}. A value
// that does not check is passed over and reported, and so is a file that is not JSON: a typo
// never turns screening off. Files are read on each use, so an edit holds from the next event.

export type Scope = 'user' | 'project'
export type Source = 'kill file' | '/config' | Scope | 'older setting' | 'default'

/** What the layers hold, read once: everything resolve() needs, so it can be pure. */
export type Snapshot = {
  files: Partial<Record<Scope, unknown>>
  state: unknown
  kills: string[]
  options: Record<string, unknown>
  problems: string[]
  /** jev-mod's config folder and jev-skills' (where its kill files and state.json are). */
  mod: string
  jev: string
}

export type Resolved = {
  mode: Mode
  source: Source
  knobs: Record<string, { value: KnobValue; source: Source }>
}

/** jev-mod's own config folder. */
export async function modDir(io: IO): Promise<string> {
  const xdg = await io.env('XDG_CONFIG_HOME')
  return `${xdg || `${(await io.home()) ?? ''}/.config`}/jev-mod`
}

/** Where each scope's file is; the project's only when the session has a project root. */
export async function paths(io: IO): Promise<Partial<Record<Scope, string>>> {
  const root = await io.projectRoot()
  return { user: `${await modDir(io)}/config.json`, ...(root ? { project: `${root}/.claude/jev-mod.json` } : {}) }
}

/** Whether the user's config file exists yet: it is written by the first save from /jev-mod or the dashboard. */
export async function configured(io: IO): Promise<boolean> {
  const path = (await paths(io)).user
  return !path || (await hostOf(io).readFile(path)) !== undefined
}

/** The kill files that would turn a feature off, checked in this order. */
function killFiles(f: Feature, mod: string, jev: string): string[] {
  return [`${mod}/OFF`, `${mod}/${f.id.toUpperCase().replace(/-/g, '_')}_OFF`,
    ...(f.legacy?.state ? [`${jev}/${f.legacy.state.toUpperCase()}_OFF`] : [])]
}

/** Read every layer. Nothing here throws: what cannot be read is reported and passed over. */
export async function snapshot(io: IO, features: readonly Feature[] = FEATURES): Promise<Snapshot> {
  const host = hostOf(io)
  const mod = await modDir(io)
  const jev = await jevDir(io)
  const problems: string[] = []
  const files: Partial<Record<Scope, unknown>> = {}
  for (const [scope, path] of Object.entries(await paths(io)) as [Scope, string][]) {
    const text = await host.readFile(path)
    if (text === undefined) continue
    try {
      files[scope] = JSON.parse(text)
    } catch {
      problems.push(`${path} is not JSON; its settings are passed over`)
    }
  }
  const candidates = [...new Set(features.flatMap(f => killFiles(f, mod, jev)))]
  const found = await Promise.all(candidates.map(async path => (await host.readFile(path)) !== undefined))
  const stateText = await host.readFile(`${jev}/state.json`)
  let state: unknown
  if (stateText !== undefined) {
    try { state = JSON.parse(stateText) } catch { state = 'unreadable' }
  }
  const options = Object.fromEntries(['enabled', ...features.flatMap(f => (f.legacy ? [f.legacy.option] : []))]
    .map(name => [name, io.option(name)]))
  return { files, state, kills: candidates.filter((_, i) => found[i]), options, problems, mod, jev }
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** A file's settings for one feature, or undefined. */
function section(file: unknown, id: string): Record<string, unknown> | undefined {
  if (!isObject(file) || !isObject(file.features)) return undefined
  const mine = file.features[id]
  return isObject(mine) ? mine : undefined
}

/** jev-skills' state.json switch, as jev-skills reads it: unknown, misspelt or unreadable is off. */
function stateMode(f: Feature, state: unknown): Mode | undefined {
  if (!f.legacy?.state || state === undefined) return undefined
  if (!isObject(state)) return 'off'
  const value = state[f.legacy.state]
  if (value === undefined || value === null) return undefined
  const named = String(value).toLowerCase()
  return (f.modes as readonly string[]).includes(named) ? named as Mode : 'off'
}

/** The kill files present that turn this feature off. */
export function killedBy(snap: Snapshot, f: Feature): string[] {
  return killFiles(f, snap.mod, snap.jev).filter(path => snap.kills.includes(path))
}

/** The mode the layers beneath the project's file give a feature: the user's file, older switches, the default. */
export function beneathProject(snap: Snapshot, f: Feature): { mode: Mode; source: Source } {
  const mine = section(snap.files.user, f.id)
  if (mine && 'mode' in mine) {
    const checked = checkMode(f, mine.mode)
    if ('mode' in checked) return { mode: checked.mode, source: 'user' }
  }
  if (f.legacy) {
    const set = snap.options[f.legacy.option]
    if (typeof set === 'string' && set !== f.legacy.unset) {
      const checked = checkMode(f, set)
      if ('mode' in checked) return { mode: checked.mode, source: 'older setting' }
    }
    const fromState = stateMode(f, snap.state)
    if (fromState) return { mode: fromState, source: 'older setting' }
  }
  return { mode: f.default, source: 'default' }
}

/**
 * Whether the project's file may set this mode: for a protective feature, only one no looser than
 * beneath it; for a risky one (it acts for the person), only one no further on than beneath it.
 */
function projectMay(snap: Snapshot, f: Feature, mode: Mode): boolean {
  if (f.risky) return strictness(mode) <= strictness(beneathProject(snap, f).mode)
  return !f.protective || strictness(mode) >= strictness(beneathProject(snap, f).mode)
}

/** One feature's mode and knobs from a snapshot. Pure. */
export function resolve(snap: Snapshot, f: Feature): Resolved {
  const knobs: Resolved['knobs'] = Object.fromEntries(Object.entries(f.knobs).map(([name, k]) => [name, { value: k.default, source: 'default' as Source }]))
  // a protective or risky feature's knobs come from the user's file alone: a cloned repo cannot loosen them
  for (const scope of f.protective || f.risky ? ['user'] as const : ['user', 'project'] as const) {
    const mine = section(snap.files[scope], f.id)
    for (const name of Object.keys(f.knobs)) {
      if (!mine || !(name in mine)) continue
      const checked = checkKnob(f, name, mine[name])
      if ('value' in checked) knobs[name] = { value: checked.value, source: scope }
    }
  }
  const at = (mode: Mode, source: Source): Resolved => ({ mode, source, knobs })
  if (killedBy(snap, f).length) return at('off', 'kill file')
  const enabled = snap.options.enabled
  if (enabled === false || enabled === 'false') return at('off', '/config')
  const project = section(snap.files.project, f.id)
  if (project && 'mode' in project) {
    const checked = checkMode(f, project.mode)
    if ('mode' in checked && projectMay(snap, f, checked.mode)) return at(checked.mode, 'project')
  }
  const below = beneathProject(snap, f)
  return at(below.mode, below.source)
}

/** Why a project may not set this, or null when it may: a protective feature only gets stricter. */
function projectRefuses(snap: Snapshot, f: Feature, key: string, value: unknown): string | null {
  if (!f.protective && !f.risky) return null
  if (key !== 'mode') {
    return `project config may not set ${f.id}.${key}: ${f.id} ${f.risky ? 'acts for you' : 'guards you'}, so only your own file sets its settings`
  }
  const checked = checkMode(f, value)
  if (!('mode' in checked) || projectMay(snap, f, checked.mode)) return null
  const below = beneathProject(snap, f)
  if (f.risky) {
    return `project config may not turn ${f.id} ${checked.mode}: it acts for you, so a project may only turn it off (${below.mode} from ${below.source})`
  }
  return `project config may not lower ${f.id}: ${checked.mode} is looser than ${below.mode} (${below.source}), and a project may only make it stricter`
}

/** Everything in the files that was passed over: unknown features, modes and knobs that do not check. */
export function problems(snap: Snapshot, features: readonly Feature[] = FEATURES): string[] {
  const out = [...snap.problems]
  for (const scope of ['user', 'project'] as const) {
    const file = snap.files[scope]
    if (file === undefined) continue
    if (!isObject(file) || (file.features !== undefined && !isObject(file.features))) {
      out.push(`${scope} config: "features" must be an object of feature settings`)
      continue
    }
    for (const [id, settings] of Object.entries(isObject(file.features) ? file.features : {})) {
      const f = feature(id, features)
      if (!f) { out.push(`${scope} config: no feature ${id} (there are ${features.map(x => x.id).join(', ')})`); continue }
      if (!isObject(settings)) { out.push(`${scope} config: ${id} must be an object`); continue }
      for (const [key, value] of Object.entries(settings)) {
        const checked = key === 'mode' ? checkMode(f, value) : checkKnob(f, key, value)
        if ('problem' in checked) out.push(`${scope} config: ${checked.problem}`)
        else if (scope === 'project') {
          const refused = projectRefuses(snap, f, key, value)
          if (refused) out.push(`${refused}; it is passed over`)
        }
      }
    }
  }
  return out
}

/** One feature's settings now. */
export async function setting(io: IO, id: string): Promise<Resolved> {
  const f = feature(id)
  if (!f) throw new Error(`no feature ${id}`)
  return resolve(await snapshot(io), f)
}

/** One feature's mode now; what every feature asks before it acts. */
export async function modeOf(io: IO, id: string): Promise<Mode> {
  return (await setting(io, id)).mode
}

/**
 * Set (or with undefined, clear) one feature's mode or knob in one scope's file, keeping the
 * rest of the file as it was. The value is checked first; nothing is written when it fails.
 */
export async function write(io: IO, scope: Scope, id: string, key: string, value: unknown,
  features: readonly Feature[] = FEATURES): Promise<{ ok: true; path: string } | { problem: string }> {
  const f = feature(id, features)
  if (!f) return { problem: `no feature ${id} (there are ${features.map(x => x.id).join(', ')})` }
  let checked: unknown
  if (value !== undefined) {
    const result = key === 'mode' ? checkMode(f, value) : checkKnob(f, key, value)
    if ('problem' in result) return result
    checked = 'mode' in result ? result.mode : result.value
    // a project may tighten a protective feature, never loosen it: refused here, so /jev-mod and the dashboard both say so
    if (scope === 'project' && (f.protective || f.risky)) {
      const refused = projectRefuses(await snapshot(io, features), f, key, checked)
      if (refused) return { problem: refused }
    }
  }
  return edit(io, scope, id, mine => {
    if (checked === undefined) delete mine[key]
    else mine[key] = checked
  })
}

/** Clear everything one scope's file sets for a feature, the keys it does not know included. */
export async function reset(io: IO, scope: Scope, id: string,
  features: readonly Feature[] = FEATURES): Promise<{ ok: true; path: string } | { problem: string }> {
  if (!feature(id, features)) return { problem: `no feature ${id} (there are ${features.map(x => x.id).join(', ')})` }
  return edit(io, scope, id, mine => { for (const key of Object.keys(mine)) delete mine[key] })
}

/** Change one feature's section of a scope's file in place; an emptied section is removed. */
async function edit(io: IO, scope: Scope, id: string, change: (mine: Record<string, unknown>) => void,
): Promise<{ ok: true; path: string } | { problem: string }> {
  const path = (await paths(io))[scope]
  if (!path) return { problem: 'this session has no project folder to keep a project setting in' }
  const text = await hostOf(io).readFile(path)
  let file: Record<string, unknown> = {}
  if (text !== undefined) {
    try {
      const parsed = JSON.parse(text)
      if (!isObject(parsed)) return { problem: `${path} is not a JSON object; fix or remove it first` }
      file = parsed
    } catch {
      return { problem: `${path} is not JSON; fix or remove it first` }
    }
  }
  const sections = isObject(file.features) ? { ...file.features } : {}
  const mine = isObject(sections[id]) ? { ...(sections[id] as Record<string, unknown>) } : {}
  change(mine)
  if (Object.keys(mine).length) sections[id] = mine
  else delete sections[id]
  await io.writeFile(path, JSON.stringify({ ...file, features: sections }, null, 2) + '\n')
  return { ok: true, path }
}
