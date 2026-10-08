// Where a decision backend's key lives, and how to read it without showing it.
//
// For each built-in provider, first hit wins: its environment variable, the key set in the
// mod's own settings (kept by Claude Code in secure storage, for the provider picked there), the
// OS secret store (macOS Keychain or secret-tool), then a 0600 file under ~/.config/jev. A named backend's
// key is read the same way under its own name, so it can never be mistaken for a provider key
// and a provider key can never be read as a backend's.
//
// Ported from jev-skills' jevkit/keystore.py, reading the same names and files, so keys stored
// by `jev setup-key` are found where they are. Nothing here prints, logs or returns a key to
// anything but the request that needs it.

import { keyVariable, type Backend } from './backends'
import { splitlines, strip } from './pyre'

/** What key lookup needs from the outside world. */
export interface KeyHost {
  env(name: string): Promise<string | undefined>
  /** The file's text; undefined when it does not exist or cannot be read. */
  readFile(path: string): Promise<string | undefined>
  /** The OS secret store's value for (service, account), or undefined. */
  secret(service: string, account: string): Promise<string | undefined>
  home(): Promise<string>
  /** One of the mod's settings (`api_key`, `provider`, `backend_api_key`); none in jev-skills. */
  setting?(name: 'api_key' | 'provider' | 'backend_api_key'): Promise<string | undefined>
}

export type KeySource = 'environment' | 'settings' | 'keychain' | 'file' | 'none'

export const PROVIDERS = ['typesafe', 'openrouter', 'venice', 'zen'] as const
export type Provider = typeof PROVIDERS[number]

export const ENV: Record<Provider, string> = {
  typesafe: 'TYPESAFE_API_KEY', openrouter: 'OPENROUTER_API_KEY', venice: 'VENICE_API_KEY', zen: 'OPENCODE_ZEN_API_KEY',
}
// The secret-store service names jev-skills stores under; kept so stored keys are found.
const SERVICE: Record<Provider, string> = {
  typesafe: 'Hermes TypeSafe API', openrouter: 'Hermes OpenRouter API', venice: 'Hermes Venice API', zen: 'Hermes OpenCode Zen API',
}
const FILE: Record<Provider, string> = {
  typesafe: 'credentials', openrouter: 'credentials-openrouter', venice: 'credentials-venice', zen: 'credentials-zen',
}

export async function configDir(host: KeyHost): Promise<string> {
  const xdg = await host.env('XDG_CONFIG_HOME')
  return `${xdg || `${await host.home()}/.config`}/jev`
}

async function fromFile(host: KeyHost, path: string, variable: string): Promise<string | undefined> {
  const text = await host.readFile(path)
  if (text === undefined) return undefined
  for (const line of splitlines(text)) {
    if (line.startsWith(variable + '=')) return strip(line.slice(variable.length + 1)) || undefined
  }
  return undefined
}

async function envKey(host: KeyHost, name: string): Promise<string | undefined> {
  return strip((await host.env(name)) ?? '') || undefined
}

async function settingKey(host: KeyHost, name: 'api_key' | 'backend_api_key'): Promise<string | undefined> {
  return strip((await host.setting?.(name)) ?? '') || undefined
}

/** The provider the mod's settings hold a key for, or undefined. */
async function settingsProvider(host: KeyHost): Promise<Provider | undefined> {
  if (!(await settingKey(host, 'api_key'))) return undefined
  const named = strip((await host.setting?.('provider')) ?? '') || 'typesafe'
  return (PROVIDERS as readonly string[]).includes(named) ? named as Provider : undefined
}

/** One provider's key and where it was found; nothing anywhere else ever sees which key. */
async function lookup(host: KeyHost, provider: Provider): Promise<[string | undefined, KeySource]> {
  const env = await envKey(host, ENV[provider])
  if (env) return [env, 'environment']
  if (await settingsProvider(host) === provider) return [await settingKey(host, 'api_key'), 'settings']
  const stored = await host.secret(SERVICE[provider], ENV[provider])
  if (stored) return [stored, 'keychain']
  const file = await fromFile(host, `${await configDir(host)}/${FILE[provider]}`, ENV[provider])
  return file ? [file, 'file'] : [undefined, 'none']
}

/** One provider's key, or undefined. */
export async function providerKey(host: KeyHost, provider: Provider): Promise<string | undefined> {
  return (await lookup(host, provider))[0]
}

/** Where a provider's key would come from: never the key. */
export async function keySource(host: KeyHost, provider: Provider): Promise<KeySource> {
  return (await lookup(host, provider))[1]
}

/**
 * Which provider this machine can reach Jev through: TypeSafe first, always, so an install
 * does not start routing elsewhere because another key happens to be around. JEV_PROVIDER
 * overrides that order when it names a provider this machine has a key for.
 */
export async function provider(host: KeyHost): Promise<Provider | 'absent'> {
  const pinned = strip((await host.env('JEV_PROVIDER')) ?? '')
  if ((PROVIDERS as readonly string[]).includes(pinned) && await providerKey(host, pinned as Provider)) return pinned as Provider
  // A key set in the mod's settings is for the provider picked beside it.
  const chosen = await settingsProvider(host)
  if (chosen) return chosen
  for (const name of PROVIDERS) if (await providerKey(host, name)) return name
  return 'absent'
}

async function backendLookup(host: KeyHost, backend: Backend): Promise<[string | undefined, KeySource]> {
  const variable = keyVariable(backend)
  const env = await envKey(host, variable)
  if (env) return [env, 'environment']
  const set = await settingKey(host, 'backend_api_key')
  if (set) return [set, 'settings']
  const stored = await host.secret(`Jev backend ${backend.name}`, variable)
  if (stored) return [stored, 'keychain']
  const file = await fromFile(host, `${await configDir(host)}/credentials-backend-${backend.name}`, variable)
  return file ? [file, 'file'] : [undefined, 'none']
}

/** A named backend's key, under its own name in every store (the mod's setting is for the active one). */
export async function backendKey(host: KeyHost, backend: Backend): Promise<string | undefined> {
  return (await backendLookup(host, backend))[0]
}

/** Where a named backend's key would come from: never the key. */
export async function backendKeySource(host: KeyHost, backend: Backend): Promise<KeySource> {
  return (await backendLookup(host, backend))[1]
}
