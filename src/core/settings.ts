import type { IO } from './io'
import { hostOf } from './host'
import { configDir } from '../engine/keys'

// jev's switches. The mod's own settings (/config) come first; left at "default", the files
// jev-skills' `jev switches` writes decide, so an existing setting holds: <config>/state.json,
// and a <SWITCH>_OFF file beside it that turns the switch off whatever anything else says.
// With neither, a switch is on: the mod is installed to do these things.

/** jev's config folder: JEV_HOME, else the platform's (keys.configDir). */
export async function jevDir(io: IO): Promise<string> {
  const host = hostOf(io)
  return (await host.env('JEV_HOME')) || await configDir(host)
}

const OPTION = { hook_screen: 'screening', hook_skills: 'skills' } as const
const MODES = ['off', 'shadow', 'on']

/** A switch's mode: "off", "shadow" (judge and count, change nothing) or "on". */
export async function mode(io: IO, dir: string, name: 'hook_screen' | 'hook_skills'): Promise<string> {
  const host = hostOf(io)
  if (await host.readFile(`${dir}/${name.toUpperCase()}_OFF`) !== undefined) return 'off'
  const chosen = io.option(OPTION[name])
  if (typeof chosen === 'string' && MODES.includes(chosen)) return chosen
  const text = await host.readFile(`${dir}/state.json`)
  if (text === undefined) return 'on'
  try {
    const value = JSON.parse(text)[name]
    if (value === undefined || value === null) return 'on'
    // A setting jev-skills would read as off (unknown, misspelt) stays off here too.
    return MODES.includes(String(value).toLowerCase()) ? String(value).toLowerCase() : 'off'
  } catch {
    return 'off'
  }
}

/** Whether routing changes turns: the mod's setting, on unless set off. */
export function routingOn(io: IO): boolean {
  return io.option('routing') !== 'off'
}

/** Private sends nothing: the mod's setting, or the profile listed in routing.json's private_profiles (or one we cannot read). */
export async function isPrivate(io: IO, dir: string): Promise<boolean> {
  if (io.option('private') === true) return true
  const text = await hostOf(io).readFile(`${dir}/routing.json`)
  if (text === undefined) return false
  try {
    const list = JSON.parse(text).private_profiles
    return Array.isArray(list) && list.includes('default')
  } catch {
    return true
  }
}
