import { test, expect } from 'claude-code/testing'
import type { FetchInit, IO } from '../../core/io'
import * as memory from '../../core/memory'
import { analyse, step, turnStarted, type RoutingSpace } from './index'

// Routing's glue with a fake IO: when Jev gives no answer, the turn runs as is and the session's
// lane does not step down.

const USER = '/home/u/.config/jev-mod/config.json'

function io(opts: { fail?: boolean; priv?: boolean } = {}): IO {
  const files: Record<string, string> = { [USER]: JSON.stringify({ features: { routing: { mode: 'on' } } }) }
  const store: Record<string, unknown> = {}
  const env: Record<string, string> = { JEV_HOME: '/jev', JEV_LIMITS: 'off', TYPESAFE_API_KEY: 'test-not-a-key' }
  return {
    option: (name: string) => (name === 'private' && opts.priv ? true : undefined),
    readFile: async (path: string) => { if (path in files) return files[path]; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    folders: async () => [], files: async () => [],
    env: async (name: string) => env[name],
    home: async () => '/home/u',
    projectRoot: async () => '/home/u/proj',
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
    sleep: async () => {},
    sessionId: async () => 'routing-session',
    storeGet: async (key: string) => store[key],
    storeSet: async (key: string, value: unknown) => { store[key] = value },
    status: () => {}, toast: () => {},
    usage: async () => ({ contextTokens: 1000 }),
    fetch: async (_url: string, _init?: FetchInit) => {
      if (opts.fail) throw new Error('network down')
      return { status: 500, ok: false, text: '' }
    },
  } as unknown as IO
}

async function turn(fake: IO, id: string, text: string) {
  await analyse(fake, text)
  turnStarted(id, text)
  return step(fake, { turnId: id, model: 'claude-opus-5-5', effort: 'high' })
}

async function inWindow(fake: IO): Promise<RoutingSpace> {
  await memory.load(fake)
  const mine = memory.space<RoutingSpace>('routing')
  mine.previous = { lane: 'escalate', at: Date.now() - 60_000, corrections: 0 }
  return mine
}

test('a failing backend inside the follow-up window runs the turn as is and keeps the lane', async () => {
  const fake = io({ fail: true })
  const mine = await inWindow(fake)
  const before = { ...mine.previous! }
  expect(await turn(fake, 'a1', 'now rename the helper')).toBe(null)
  expect(await turn(fake, 'a2', 'and the tests too')).toBe(null)
  expect(mine.previous).toEqual(before)
})

test('private mode inside the follow-up window runs the turn as is and keeps the lane', async () => {
  const fake = io({ priv: true })
  const mine = await inWindow(fake)
  const before = { ...mine.previous! }
  expect(await turn(fake, 'b1', 'now rename the helper')).toBe(null)
  expect(mine.previous).toEqual(before)
})
