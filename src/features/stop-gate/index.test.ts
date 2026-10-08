import { test, expect } from 'claude-code/testing'
import { settled } from '../../core/background'
import type { FetchInit, IO } from '../../core/io'
import { check } from './index'

// The completion gate's glue with a fake IO: in shadow the agent's stop never waits for the judgement.

const USER = '/home/u/.config/jev-mod/config.json'

test('shadow lets the agent stop before a slow backend answers, then counts the judgement once', async () => {
  let release: () => void = () => {}
  const slow = new Promise<void>(r => { release = r })
  const store: Record<string, unknown> = {}
  let asked = 0
  const files: Record<string, string> = { [USER]: JSON.stringify({ features: { 'stop-gate': { mode: 'shadow' } } }) }
  const env: Record<string, string> = { JEV_HOME: '/jev', JEV_LIMITS: 'off', TYPESAFE_API_KEY: 'test-not-a-key' }
  const fake = {
    option: () => undefined,
    readFile: async (path: string) => { if (path in files) return files[path]; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    env: async (name: string) => env[name], home: async () => '/home/u', projectRoot: async () => '/p',
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }), sleep: () => new Promise<void>(() => {}),
    sessionId: async () => 'stop-session',
    storeGet: async (key: string) => store[key], storeSet: async (key: string, value: unknown) => { store[key] = value },
    status: () => {}, toast: () => {},
    messages: async () => [{ role: 'user', text: 'fix the parser' }, { role: 'assistant', text: 'Done. All tests pass.' }],
    fetch: async (_url: string, init?: FetchInit) => {
      await slow
      asked++
      const body = JSON.parse(init!.body!)
      const answers = Object.fromEntries(Object.keys(body.questions).map(q => [q, { type: 'noul', noul: 0.9 }]))
      return { status: 200, ok: true, text: JSON.stringify({ answers, model: 'jev-test', usage: { input_tokens: 10 } }) }
    },
  } as unknown as IO
  expect(await check(fake, { promptId: 'p1', last: 'Done. All tests pass.' })).toBe(null)
  expect(asked).toBe(0) // it returned before the backend answered
  release()
  await settled()
  await new Promise(r => setTimeout(r, 10))
  expect(asked).toBeGreaterThan(0)
  const today = Object.values(store.activity as Record<string, any>)[0]['stop-gate'] as Record<string, number>
  const outcomes = ['passed', 'would-nudge', 'skipped'].reduce((n, k) => n + (today[k] ?? 0), 0)
  expect(outcomes).toBe(1) // one judgement, one outcome
  expect(today.nudged).toBe(undefined)
})
