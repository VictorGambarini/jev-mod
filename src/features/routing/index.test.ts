import { test, expect } from 'claude-code/testing'
import * as activity from '../../core/activity'
import type { FetchInit, IO } from '../../core/io'
import { record } from '../../core/jev'
import * as memory from '../../core/memory'
import { analyse, modelChosen, step, turnStarted, type RoutingSpace } from './index'

// Routing's glue with a fake IO: when Jev gives no answer, the turn runs as is and the session's
// lane does not step down.

const USER = '/home/u/.config/jev-mod/config.json'
const OPTIONS = ['small', 'medium', 'high', 'escalate', 'other']

type Opts = { fail?: boolean; priv?: boolean; session?: string; mode?: 'on' | 'off'; lane?: string; model?: string }
type Fake = IO & { asked: number }

function io(opts: Opts = {}): Fake {
  const files: Record<string, string> = { [USER]: JSON.stringify({ features: { routing: { mode: opts.mode ?? 'on' } } }) }
  const store: Record<string, unknown> = {}
  const env: Record<string, string> = { JEV_HOME: '/jev', JEV_LIMITS: 'off', TYPESAFE_API_KEY: 'test-not-a-key' }
  const fake = {
    asked: 0,
    option: (name: string) => (name === 'private' && opts.priv ? true : undefined),
    readFile: async (path: string) => { if (path in files) return files[path]; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    folders: async () => [], files: async () => [],
    env: async (name: string) => env[name],
    home: async () => '/home/u',
    projectRoot: async () => '/home/u/proj',
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
    sleep: async () => {},
    sessionId: async () => opts.session ?? 'routing-session',
    storeGet: async (key: string) => store[key],
    storeSet: async (key: string, value: unknown) => { store[key] = value },
    status: () => {}, toast: () => {},
    usage: async () => ({ contextTokens: 1000 }),
    fetch: async (_url: string, init?: FetchInit) => {
      fake.asked++
      if (opts.fail) throw new Error('network down')
      if (!opts.lane) return { status: 500, ok: false, text: '' }
      const answers = {
        lane: { type: 'choice', choice: opts.lane, confidence: 0.9,
          probabilities: Object.fromEntries(OPTIONS.map(o => [o, o === opts.lane ? 0.9 : 0.025])) },
        security_sensitive: { type: 'noul', noul: 0.05 }, underspecified: { type: 'noul', noul: 0.05 },
      }
      void init
      return { status: 200, ok: true, text: JSON.stringify({ answers, model: opts.model ?? 'jev-1.13.0', usage: { input_tokens: 100 } }) }
    },
  }
  return fake as unknown as Fake
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

// The tests below each have their own session; a call that answers ends the cool-off the
// failing-backend test above started (core/jev.ts).
async function fresh(opts: Opts): Promise<{ fake: Fake; mine: RoutingSpace }> {
  const fake = io(opts)
  await memory.load(fake)
  await record(fake, { calls: 1, cost: 0, error: null })
  return { fake, mine: memory.space<RoutingSpace>('routing') }
}

const today = async (fake: IO) => Object.values(await activity.activity(fake, 1))[0]?.routing ?? {}

test('routing off: the turn is Claude Code\'s, and nothing is recorded or counted', async () => {
  const { fake, mine } = await fresh({ session: 'off-session', mode: 'off', lane: 'small' })
  expect(await turn(fake, 'c1', 'rename the helper')).toBe(null)
  expect(fake.asked).toBe(0)
  expect(mine.lane).toBe(undefined)
  expect(await today(fake)).toEqual({})
})

test('no answer from Jev is counted unavailable, not kept', async () => {
  const { fake } = await fresh({ session: 'down-session' }) // the backend answers HTTP 500
  expect(await turn(fake, 'd1', 'rename the other helper')).toBe(null)
  const counts = await today(fake)
  expect(counts.unavailable).toBe(1)
  expect(counts.kept).toBe(undefined)
})

test('the person\'s /model holds: Jev is not asked and the turn keeps their model, until Default', async () => {
  const { fake, mine } = await fresh({ session: 'model-session', lane: 'small' })
  await modelChosen(fake, { source: 'command', requested_model: 'opus', to_model: 'claude-opus-5-5' })
  expect(await turn(fake, 'e1', 'fix the typo in the readme')).toBe(null)
  expect(fake.asked).toBe(0)
  expect(mine.why).toBe('your /model')
  // an automatic fallback is not the person's choice; Default hands the session back to routing
  await modelChosen(fake, { source: 'auto', requested_model: null, to_model: 'claude-sonnet-5-5' })
  expect(mine.personModel).toBe('claude-opus-5-5')
  await modelChosen(fake, { source: 'picker', requested_model: null, to_model: 'claude-opus-5-5' })
  expect(await turn(fake, 'e2', 'fix the typo in the changelog')).toEqual({ model: 'claude-haiku-4-5-20251001', effort: undefined })
  expect(fake.asked).toBe(1)
})

test('a second correction in a row starts at escalate without asking Jev', async () => {
  const { fake, mine } = await fresh({ session: 'fail-session', lane: 'small' })
  mine.previous = { lane: 'medium', at: Date.now() - 60_000, corrections: 1 }
  expect(await turn(fake, 'f1', 'still broken, same error')).toEqual({ model: 'claude-opus-5-5', effort: 'high' })
  expect(fake.asked).toBe(0)
  expect(mine.lane).toBe('escalate')
})

test('a Jev the policy was not tuned on: not routed, and the record says why', async () => {
  const { fake, mine } = await fresh({ session: 'drift-session', lane: 'small', model: 'typesafe/jev-1.14-20261001' })
  expect(await turn(fake, 'g1', 'fix the typo in the docs')).toBe(null)
  expect(fake.asked).toBe(1)
  expect(mine.drift).toBe('Jev 1.14 ≠ tuned 1.13')
  expect(mine.why).toBe('Jev 1.14 ≠ tuned 1.13')
  expect((await today(fake)).unavailable).toBe(1)
})
