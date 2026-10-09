import type { Scope } from '../../core/config'
import { MODES, type Feature } from '../../core/registry'

// /jev-mod's arguments, read into what to do. Pure: the text after the name in, an action out.
//
//   /jev-mod [list]                          every feature, its mode and settings
//   /jev-mod status | compact | dashboard [stop] | help
//   /jev-mod <feature>                       its help, modes and settings
//   /jev-mod <feature> on|off|shadow         set its mode
//   /jev-mod <feature> <setting> <value>     set one of its settings
//   /jev-mod <feature> reset                 clear what the file sets for it
//   /jev-mod browser install                 install Playwright and Chromium for the browse tool
//
// --project, anywhere, writes the project's file instead of yours.

export type Action =
  | { kind: 'list' | 'status' | 'compact' | 'help' }
  | { kind: 'dashboard'; stop?: true }
  | { kind: 'show'; feature: string }
  | { kind: 'set'; feature: string; key: string; value: string; scope: Scope }
  | { kind: 'reset'; feature: string; scope: Scope }
  | { kind: 'browser-install' }
  | { kind: 'usage'; problem: string }

export const WORDS = ['list', 'status', 'compact', 'dashboard', 'help'] as const

const ABOUT: Record<(typeof WORDS)[number], string> = {
  list: 'every feature, its mode and settings',
  status: "the backend, its key source, a live check, today's spend",
  compact: 'compact keeping only the turns Jev marks keep, no summary',
  dashboard: 'a page in your browser to see and set every feature (stop ends it)',
  help: 'how to use /jev-mod',
}

export function parse(args: string, features: readonly Feature[]): Action {
  const words = args.trim().split(/\s+/).filter(Boolean)
  const scope: Scope = words.includes('--project') ? 'project' : 'user'
  const [first, second, ...rest] = words.filter(w => w !== '--project')
  if (first === undefined) return { kind: 'list' }
  const word = first.toLowerCase()
  if ((WORDS as readonly string[]).includes(word)) {
    if (word === 'dashboard' && second?.toLowerCase() === 'stop' && !rest.length) return { kind: 'dashboard', stop: true }
    if (second !== undefined) return { kind: 'usage', problem: `${word} takes nothing after it` }
    return { kind: word } as Action
  }
  const f = features.find(x => x.id === word)
  if (!f) return { kind: 'usage', problem: `no feature or command ${first} (features: ${features.map(x => x.id).join(', ')})` }
  if (second === undefined) return { kind: 'show', feature: f.id }
  const what = second.toLowerCase()
  if (f.id === 'browser' && what === 'install' && !rest.length) return { kind: 'browser-install' }
  if (what === 'reset' && !rest.length) return { kind: 'reset', feature: f.id, scope }
  if ((MODES as readonly string[]).includes(what) && !rest.length) return { kind: 'set', feature: f.id, key: 'mode', value: what, scope }
  if (second in f.knobs) {
    if (!rest.length) return { kind: 'usage', problem: `${f.id}.${second} needs a value: /jev-mod ${f.id} ${second} <value>` }
    return { kind: 'set', feature: f.id, key: second, value: rest.join(' '), scope }
  }
  const knobs = Object.keys(f.knobs)
  return { kind: 'usage', problem: `${f.id} takes ${[...f.modes, 'reset', ...knobs].join(', ')}, not ${second}` }
}

export type Suggestion = { text: string; description?: string }

/**
 * The typeahead rows for the word being typed after /jev-mod, or none. `before` is the prompt
 * up to the cursor, `token` the word at it (never empty).
 */
export function complete(before: string, token: string, features: readonly Feature[]): Suggestion[] {
  const found = /^\s*\/jev-mod\s+(.*)$/s.exec(before)
  if (!found) return []
  const typed = (found[1] ?? '').split(/\s+/)
  if (!token || typed[typed.length - 1] !== token) return []
  const done = typed.slice(0, -1).filter(w => w !== '--project')
  const starts = (rows: Suggestion[]) => rows.filter(r => r.text.startsWith(token) && r.text !== token)
  if (token.startsWith('--')) return starts([{ text: '--project', description: "write the project's .claude/jev-mod.json" }])
  if (done.length === 1 && done[0] === 'dashboard') return starts([{ text: 'stop', description: 'stop the dashboard server' }])
  if (done.length === 0) {
    return starts([...WORDS.map(w => ({ text: w, description: ABOUT[w] })), ...features.map(f => ({ text: f.id, description: f.summary }))])
  }
  const f = features.find(x => x.id === done[0])
  if (!f) return []
  if (done.length === 1) {
    return starts([...f.modes.map(m => ({ text: m, description: `mode ${m}` })), { text: 'reset', description: 'clear what the file sets' },
      ...(f.id === 'browser' ? [{ text: 'install', description: 'install Playwright and Chromium (about 150 MB)' }] : []),
      ...Object.entries(f.knobs).map(([name, k]) => ({ text: name, description: k.title }))])
  }
  const knob = done.length === 2 ? f.knobs[done[1] ?? ''] : undefined
  if (knob) {
    const values: readonly string[] = knob.type === 'choice' ? knob.options : knob.type === 'boolean' ? ['true', 'false'] : []
    return starts(values.map(v => ({ text: v })))
  }
  return []
}
