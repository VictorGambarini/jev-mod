import { test, expect } from 'claude-code/testing'
import type { FetchInit, IO } from '../../core/io'
import { analyse } from './index'

// The skills glue with a fake IO and a fake decision backend that always picks the one skill.

const USER = '/home/u/.config/jev-mod/config.json'

function io(mode: string): IO & { store: Record<string, unknown> } {
  const files: Record<string, string> = {
    [USER]: JSON.stringify({ features: { skills: { mode } } }),
    '/home/u/.claude/skills/deploy/SKILL.md': '---\nname: deploy\ndescription: Deploy the service to production\n---\nSteps.\n',
  }
  const store: Record<string, unknown> = {}
  const env: Record<string, string> = { JEV_HOME: '/jev', JEV_LIMITS: 'off', TYPESAFE_API_KEY: 'test-not-a-key' }
  return {
    store,
    readFile: async (path: string) => { if (path in files) return files[path]!; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    folders: async (dir: string) => dir === '/home/u/.claude/skills' ? ['deploy'] : [],
    files: async () => [],
    env: async (name: string) => env[name],
    home: async () => '/home/u',
    projectRoot: async () => '/proj',
    option: () => undefined,
    skillNames: async () => null,
    sessionId: async () => 's1',
    storeGet: async (key: string) => store[key],
    storeSet: async (key: string, value: unknown) => { store[key] = value },
    status: () => {}, toast: () => {},
    sleep: () => new Promise<void>(() => {}),
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
    fetch: async (_url: string, init?: FetchInit) => {
      const body = JSON.parse(init!.body!)
      const answers = Object.fromEntries(Object.keys(body.questions).map(q => q.startsWith('pick')
        ? [q, { type: 'choice', choice: 'S0', probabilities: { S0: 0.95, none: 0.05 }, confidence: 0.95 }]
        : [q, { type: 'noul', noul: 0.95 }]))
      return { status: 200, ok: true, text: JSON.stringify({ answers, model: 'jev-test', usage: { input_tokens: 10 } }) }
    },
  } as unknown as IO & { store: Record<string, unknown> }
}

const counts = (fake: { store: Record<string, unknown> }) =>
  (Object.values(fake.store.activity as Record<string, any>)[0] ?? {}).skills ?? {}

test('on: a skill is suggested once a session', async () => {
  const fake = io('on')
  expect(await analyse(fake, 'please deploy the service to production now')).toContain('deploy')
  expect(await analyse(fake, 'please deploy the service to production again')).toBeNull()
  await new Promise(r => setTimeout(r, 10))
  expect(counts(fake).suggested).toBe(1)
})

test('shadow: nothing is suggested, and would-suggest is counted once a session', async () => {
  const fake = io('shadow')
  expect(await analyse(fake, 'please deploy the service to production now')).toBeNull()
  expect(await analyse(fake, 'please deploy the service to production again')).toBeNull()
  await new Promise(r => setTimeout(r, 10))
  expect(counts(fake)['would-suggest']).toBe(1)
  expect(counts(fake).suggested).toBeUndefined()
})
