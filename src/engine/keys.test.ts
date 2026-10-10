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
  // A secret setting cannot be emptied, so "none" stands for no key.
  expect(await providerKey(host({}, { api_key: 'None' }, { '/home/u/.config/jev/credentials': 'TYPESAFE_API_KEY=ts-file-0001\n' }), 'typesafe')).toBe('ts-file-0001')
})

test("a named backend takes the mod's backend key, never the provider key", async () => {
  const lais: Backend = { name: 'lais05', url: 'https://x/v1/systemone', model: 'm', protocol: 'systemone', keyEnv: '', tuning: {} }
  const file = { '/home/u/.config/jev/backends.json': '{"default": "lais05", "backends": {}}' }
  const h = host({}, { api_key: 'ts-settings-0001', backend_api_key: 'be-settings-0001' }, file, { 'Jev backend lais05/JEV_BACKEND_LAIS05_API_KEY': 'be-keychain-0001' })
  expect(await backendKey(h, lais)).toBe('be-settings-0001')
  expect(await backendKeySource(h, lais)).toBe('settings')
  expect(await backendKey(host({}, { api_key: 'ts-settings-0001' }), lais)).toBe(undefined)
})

test("the mod's backend key is only for the backend backends.json names as default", async () => {
  const other: Backend = { name: 'other', url: 'https://other.example/v1/systemone', model: 'm', protocol: 'systemone', keyEnv: '', tuning: {} }
  const lais: Backend = { ...other, name: 'lais05', url: 'https://x/v1/systemone' }
  const settings = { backend_api_key: 'be-settings-0001' }
  const file = { '/home/u/.config/jev/backends.json': '{"default": "lais05", "backends": {}}' }
  // Another backend reads its own stores, never the setting.
  expect(await backendKey(host({}, settings, file), other)).toBe(undefined)
  expect(await backendKeySource(host({}, settings, file), other)).toBe('none')
  expect(await backendKey(host({}, settings, file, { 'Jev backend other/JEV_BACKEND_OTHER_API_KEY': 'other-keychain-0001' }), other)).toBe('other-keychain-0001')
  // No file, no default, or a file that cannot be read: the setting belongs to nobody.
  expect(await backendKey(host({}, settings), lais)).toBe(undefined)
  expect(await backendKey(host({}, settings, { '/home/u/.config/jev/backends.json': '{"backends": {}}' }), lais)).toBe(undefined)
  expect(await backendKey(host({}, settings, { '/home/u/.config/jev/backends.json': 'not json' }), lais)).toBe(undefined)
  // JEV_BACKENDS moves the file, and the default is read from there.
  expect(await backendKey(host({ JEV_BACKENDS: '~/b.json' }, settings, { '/home/u/b.json': '{"default": "lais05"}' }), lais)).toBe('be-settings-0001')
})
