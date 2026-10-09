import { killedBy, paths, problems, reset, resolve, snapshot, write } from '../../core/config'
import type { IO } from '../../core/io'
import { feature, FEATURES, type Feature } from '../../core/registry'
import { VERSION } from '../../version'
import { install as installBrowser } from '../browser/child'
import * as compact from '../compact'
import * as dashboard from '../dashboard'
import * as status from '../status'
import { list, show, usage, written } from './format'
import { complete, parse } from './parse'

// /jev-mod: the one command that manages the mod. Every feature in the registry appears in it
// with nothing added here: its mode, its settings, its help.

export const command = {
  name: 'jev-mod',
  description: "jev-mod's features: list, set a mode or setting, status, compact, dashboard",
  argumentHint: '[status|compact|dashboard [stop]|<feature> [on|off|shadow|reset|<setting> <value>] [--project]]',
}

export async function run(io: IO, args: string): Promise<{ text: string }> {
  const action = parse(args, FEATURES)
  switch (action.kind) {
    case 'status': return status.run(io)
    case 'compact': return compact.run(io)
    case 'dashboard': return dashboard.run(io, action.stop ? 'stop' : 'open')
    case 'help': return { text: usage() }
    case 'browser-install': return installBrowser(io)
    case 'usage': return { text: usage(action.problem) }
    case 'list': {
      const snap = await snapshot(io)
      return { text: list(VERSION, FEATURES.map(f => ({ feature: f, resolved: resolve(snap, f) })), problems(snap), await paths(io)) }
    }
    case 'show': {
      const f = feature(action.feature) as Feature
      return { text: show({ feature: f, resolved: resolve(await snapshot(io), f) }) }
    }
    case 'set':
    case 'reset': {
      const f = feature(action.feature) as Feature
      const done = action.kind === 'set'
        ? await write(io, action.scope, f.id, action.key, action.value)
        : await reset(io, action.scope, f.id)
      if ('problem' in done) return { text: done.problem }
      const key = action.kind === 'set' ? action.key : null
      const snap = await snapshot(io)
      return { text: written(f, key, action.scope, done.path, resolve(snap, f), killedBy(snap, f)) }
    }
  }
}

/** Typeahead rows for /jev-mod's arguments. */
export function suggest(text: string, cursor: number, token: string) {
  return complete(text.slice(0, cursor), token, FEATURES)
}
