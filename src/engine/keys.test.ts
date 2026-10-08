import { test, expect } from 'claude-code/testing'
import { backendKey, backendKeySource, keySource, provider, providerKey, type KeyHost } from './keys'
import type { Backend } from './backends'

function host(env: Record<string, string>, settings: Record<string, string>, files: Record<string, string> = {}, stored: Record<string, string> = {}): KeyHost {
  return {
    env: async name => env[name], readFile: async path => files[path], home: async () => '/home/u',
    secret: async (service, account) => stored[`${service}/${account}`],
    setting: async name => settings[name],
  }
}

test("the mod's key is for the provider picked beside it, after the environment and before jev-skills' stores", async () => {
  const set = host({}, { api_key: 'sk-or-settings-0001', provider: 'openrouter' },
    { '/home/u/.config/jev/credentials': 'TYPESAFE_API_KEY=ts-file-0001\n' })
  expect(await provider(set)).toBe('openrouter')
  expect(await providerKey(set, 'openrouter')).toBe('sk-or-settings-0001')
  expect(await keySource(set, 'openrouter')).toBe('settings')
  expect(await providerKey(set, 'typesafe')).toBe('ts-file-0001')
  expect(await keySource(set, 'typesafe')).toBe('file')
  const env = host({ OPENROUTER_API_KEY: 'sk-or-env-0001' }, { api_key: 'sk-or-settings-0001', provider: 'openrouter' })
  expect(await providerKey(env, 'openrouter')).toBe('sk-or-env-0001')
  expect(await keySource(env, 'openrouter')).toBe('environment')
  const pinned = host({ JEV_PROVIDER: 'typesafe', TYPESAFE_API_KEY: 'ts-env-0001' }, { api_key: 'sk-or-settings-0001', provider: 'openrouter' })
  expect(await provider(pinned)).toBe('typesafe')
  // No provider picked: the key is TypeSafe's. A blank key is no key.
  expect(await providerKey(host({}, { api_key: 'ts-settings-0001' }), 'typesafe')).toBe('ts-settings-0001')
  expect(await provider(host({}, { api_key: '  ', provider: 'venice' }))).toBe('absent')
  expect(await keySource(host({}, {}), 'zen')).toBe('none')
})

test("a named backend takes the mod's backend key, never the provider key", async () => {
  const lais: Backend = { name: 'lais05', url: 'https://x/v1/systemone', model: 'm', protocol: 'systemone', keyEnv: '', tuning: {} }
  const h = host({}, { api_key: 'ts-settings-0001', backend_api_key: 'be-settings-0001' }, {}, { 'Jev backend lais05/JEV_BACKEND_LAIS05_API_KEY': 'be-keychain-0001' })
  expect(await backendKey(h, lais)).toBe('be-settings-0001')
  expect(await backendKeySource(h, lais)).toBe('settings')
  expect(await backendKey(host({}, { api_key: 'ts-settings-0001' }), lais)).toBe(undefined)
})
