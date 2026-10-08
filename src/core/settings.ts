import type { IO } from './io'
import { hostOf } from './host'
import { configDir } from '../engine/keys'

// jev's own settings, read from the files jev-skills' `jev switches` writes, so an existing
// setting holds: <config>/state.json, and a <SWITCH>_OFF file beside it that turns the switch
// off whatever the setting says.

/** jev's config folder: JEV_HOME, else the platform's (keys.configDir). */
export async function jevDir(io: IO): Promise<string> {
  const host = hostOf(io)
  return (await host.env('JEV_HOME')) || await configDir(host)
}

/** A switch's mode: "off", "shadow" (judge and count, change nothing) or "on"; unknown or unreadable is off. */
export async function mode(io: IO, dir: string, name: 'hook_screen' | 'hook_skills'): Promise<string> {
  const host = hostOf(io)
  if (await host.readFile(`${dir}/${name.toUpperCase()}_OFF`) !== undefined) return 'off'
  try {
    const value = String(JSON.parse((await host.readFile(`${dir}/state.json`)) ?? '{}')[name] ?? 'off').toLowerCase()
    return ['off', 'shadow', 'on'].includes(value) ? value : 'off'
  } catch {
    return 'off'
  }
}

/** A profile listed in routing.json's private_profiles sends nothing; so does one we cannot read. */
export async function isPrivate(io: IO, dir: string): Promise<boolean> {
  const text = await hostOf(io).readFile(`${dir}/routing.json`)
  if (text === undefined) return false
  try {
    const list = JSON.parse(text).private_profiles
    return Array.isArray(list) && list.includes('default')
  } catch {
    return true
  }
}
