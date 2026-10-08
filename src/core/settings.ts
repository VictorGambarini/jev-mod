import { hostOf } from './host'
import type { IO } from './io'
import { configDir } from '../engine/keys'

// Where jev's files are, and whether this profile is private. Which features are on, and how
// they are set, is config.ts's.

/** jev's config folder: JEV_HOME, else the platform's (keys.configDir). */
export async function jevDir(io: IO): Promise<string> {
  const host = hostOf(io)
  return (await host.env('JEV_HOME')) || await configDir(host)
}

/** Private sends nothing: the mod's setting, or the profile listed in routing.json's private_profiles (or one we cannot read). */
export async function isPrivate(io: IO, dir: string): Promise<boolean> {
  const set = io.option('private')
  if (set === true || set === 'true') return true
  const text = await hostOf(io).readFile(`${dir}/routing.json`)
  if (text === undefined) return false
  try {
    const list = JSON.parse(text).private_profiles
    return Array.isArray(list) && list.includes('default')
  } catch {
    return true
  }
}
