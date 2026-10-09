import type { Resolved, Scope, Source } from '../../core/config'
import type { Feature, Knob, KnobValue } from '../../core/registry'
import { WORDS } from './parse'

// /jev-mod's answers as text. Pure: the registry and what config.ts resolved in, lines out.

export type Shown = { feature: Feature; resolved: Resolved }

/** The layers, first that says wins (config.ts): a lower number overrides a higher one. */
const RANK: Record<Source, number> = { 'kill file': 0, '/config': 1, project: 2, user: 3, 'older setting': 4, default: 5 }

const LAYER: Record<Source, string> = { 'kill file': 'a kill file', '/config': '/config', project: 'the project file',
  user: 'your file', 'older setting': 'an older setting', default: 'the default' }
const from = (source: Source) => LAYER[source]
const origin = (source: Source) => (source === 'default' ? 'the default' : `from ${LAYER[source]}`)

function value(v: KnobValue): string {
  return typeof v === 'string' ? (v === '' ? 'none' : v) : String(v)
}

function range(k: Knob): string {
  if (k.type === 'boolean') return 'true or false'
  if (k.type === 'choice') return k.options.join(', ')
  if (k.type === 'list') return `any of ${k.options.join(', ')}, comma-separated, or none`
  return `${k.type === 'int' ? 'whole number' : 'number'} ${k.min} to ${k.max}`
}

export function usage(problem?: string): string {
  return [
    ...(problem ? [problem, ''] : []),
    '/jev-mod [list]                       every feature, its mode and settings',
    `/jev-mod ${WORDS.filter(w => w !== 'list').join(' | ')}`,
    '/jev-mod <feature>                    its help, modes and settings',
    '/jev-mod <feature> on|off|shadow      set its mode',
    '/jev-mod <feature> <setting> <value>  set one of its settings',
    '/jev-mod <feature> reset              clear what your file sets for it',
    '/jev-mod browser install              install Playwright and Chromium for the browse tool',
    '/jev-mod access [<category> on|off [host]]  the access gate: what this session allows (all off closes every one)',
    'Add --project to write the project\'s .claude/jev-mod.json instead of yours.',
  ].join('\n')
}

export function list(version: string, shown: Shown[], problems: string[], files: Partial<Record<Scope, string>>): string {
  const width = Math.max(...shown.map(s => s.feature.id.length))
  const lines = [`jev-mod ${version}`]
  for (const { feature: f, resolved: r } of shown) {
    lines.push(`${f.id.padEnd(width)}  ${r.mode.padEnd(6)}  ${f.summary}${r.source === 'default' ? '' : ` (${origin(r.source)})`}`)
    for (const [name, k] of Object.entries(r.knobs)) {
      lines.push(`${' '.repeat(width)}  ${name} = ${value(k.value)}${k.source === 'default' ? '' : ` (${origin(k.source)})`}`)
    }
  }
  for (const problem of problems) lines.push(`config: ${problem}`)
  lines.push(`files: ${Object.entries(files).map(([scope, path]) => `${scope} ${path}`).join(' · ')}`)
  lines.push('/jev-mod <feature> for its help and settings; /jev-mod help for the rest.')
  return lines.join('\n')
}

export function show({ feature: f, resolved: r }: Shown): string {
  const lines = [
    `${f.id}: ${f.title}, ${r.mode} (${origin(r.source)})`,
    f.summary,
    f.help,
    `modes: ${f.modes.join(', ')} (default ${f.default})`,
    ...(f.protective ? ['It guards you: a project file may only make its mode stricter (off < shadow < on), and its settings come from your own file alone.'] : []),
    ...(f.risky ? ['It acts for you: a project file may only turn it off, and its settings come from your own file alone.'] : []),
  ]
  const knobs = Object.entries(f.knobs)
  if (!knobs.length) lines.push('settings: none')
  for (const [name, k] of knobs) {
    const now = r.knobs[name] ?? { value: k.default, source: 'default' as Source }
    lines.push(`${name}: ${k.title}. ${k.help} (${range(k)}; default ${value(k.default)}; now ${value(now.value)}`
      + `${now.source === 'default' ? '' : `, ${origin(now.source)}`})`)
  }
  lines.push(`set: /jev-mod ${f.id} ${f.modes.join('|')}${knobs.length ? ` · /jev-mod ${f.id} <setting> <value>` : ''}`
    + ` · /jev-mod ${f.id} reset · add --project for this project only`)
  return lines.join('\n')
}

/**
 * What a write left: the feature's mode (or the knob) as it now resolves, and a warning when
 * a layer above the file just written still decides it. `kills`: the kill files that do.
 */
export function written(f: Feature, key: string | null, scope: Scope, path: string, r: Resolved, kills: string[] = []): string {
  const what = key === null ? `cleared ${f.id} in ${path}` : `set ${f.id}${key === 'mode' ? '' : `.${key}`} in ${path}`
  const lines = [what]
  const mode = `${f.id} is ${r.mode} (${origin(r.source)})`
  if (key !== null && key !== 'mode') {
    const k = r.knobs[key] ?? { value: '?', source: 'default' as Source }
    lines.push(`${f.id}.${key} is ${value(k.value)} (${origin(k.source)})`)
    if (RANK[k.source] < RANK[scope]) lines.push(`warning: ${from(k.source)} still sets ${key}; /jev-mod ${f.id} ${key} <value> --project to change it.`)
    if (r.mode === 'off') lines.push(mode)
    return lines.join('\n')
  }
  lines.push(mode)
  if (key === 'mode' && RANK[r.source] < RANK[scope]) {
    const how = r.source === 'kill file' ? `remove ${kills.length ? kills.join(' and ') : 'the kill file'} to let it take effect`
      : r.source === '/config' ? 'tick "jev-mod on" in /config to let it take effect'
        : `/jev-mod ${f.id} reset --project lets your file decide`
    lines.push(`warning: ${from(r.source)} still decides it; ${how}.`)
  }
  return lines.join('\n')
}
