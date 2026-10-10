import { test, expect } from 'claude-code/testing'
import type { IO } from './io'
import { COOL_OFF_MS, coolingOff, failureOf, record, recordCalls, REFUSED_COOL_OFF_MS, type JevSpace } from './jev'
import * as memory from './memory'
import { ask, loadingPauseMs, noul, NOT_JUDGED, OUTAGES, resetSeen, RETRYABLE, type Host } from '../engine/client'
import { advice } from '../features/status/report'

// The cool-off: one list of outages for the client's retries, the cool-off and /jev-mod status;
// a refused key or account cools off longer and shows on the band.

function io(): IO {
  const store: Record<string, unknown> = {}
  return {
    sessionId: async () => 'jev-session',
    storeGet: async (key: string) => store[key],
    storeSet: async (key: string, value: unknown) => { store[key] = value },
  } as unknown as IO
}

test('every code the client retries is an outage, and status calls each one an outage', () => {
  for (const code of RETRYABLE) {
    expect(OUTAGES).toContain(code)
    expect(failureOf(code)).toBe(code)
    expect(advice(code)).toContain('did not answer')
  }
  expect(failureOf('timeout')).toBe('timeout')
  expect(failureOf('malformed')).toBe(null)
})

test('an HTTP 500 or an overload cools off like a timeout', async () => {
  const fake = io()
  await memory.load(fake)
  const now = Date.now()
  await recordCalls(fake, [], ['http_500'])
  expect(coolingOff()).toBe(true)
  const mine = memory.space<JevSpace>('jev')
  expect(mine.error).toBe('http_500')
  expect(mine.retryAt! - now).toBeGreaterThanOrEqual(COOL_OFF_MS - 1000)
  await record(fake, { calls: 1, cost: 0, error: null }) // a call that answers ends it
  expect(coolingOff()).toBe(false)
  await recordCalls(fake, [], ['overloaded'])
  expect(coolingOff()).toBe(true)
  await record(fake, { calls: 1, cost: 0, error: null })
})

test('a refused key or an account out of credit shows, and cools off for half an hour', async () => {
  const fake = io()
  await memory.load(fake)
  const mine = memory.space<JevSpace>('jev')
  for (const code of ['auth_failed', 'credits_exhausted']) {
    const now = Date.now()
    await recordCalls(fake, [], [code])
    expect(mine.error).toBe(code)
    expect(mine.retryAt! - now).toBeGreaterThanOrEqual(REFUSED_COOL_OFF_MS - 1000)
    expect(coolingOff()).toBe(true)
    // the status check after the key is replaced answers, and the mod asks again at once
    await record(fake, { calls: 1, cost: 0, error: null })
    expect(coolingOff()).toBe(false)
    expect(mine.error).toBe(null)
  }
})

test('a backend still loading pauses for seconds, and a cut or refused input cools nothing off', async () => {
  const fake = io()
  await memory.load(fake)
  const mine = memory.space<JevSpace>('jev')
  const now = Date.now()
  await recordCalls(fake, [], ['loading'])
  expect(mine.error).toBe('loading')
  expect(mine.retryAt! - now).toBeLessThanOrEqual(loadingPauseMs() + 1000)
  expect(mine.retryAt! - now).toBeLessThan(COOL_OFF_MS)
  await record(fake, { calls: 1, cost: 0, error: null })
  for (const code of NOT_JUDGED) {
    expect(failureOf(code)).toBe(null)
    expect(OUTAGES).not.toContain(code)
    await recordCalls(fake, [], [code])
    expect(coolingOff()).toBe(false)
  }
})

test("a backend's pinned yes/no answers are kept in the session's record for the band", async () => {
  resetSeen()
  const fake = io()
  await memory.load(fake)
  const config = JSON.stringify({ default: 'von', backends: { von: { url: 'http://127.0.0.1:8000/v1/systemone', model: 'von' } } })
  let n = 0
  const host: Host = {
    env: async name => (name === 'XDG_CONFIG_HOME' ? '/cfg' : undefined), readFile: async path => (path === '/cfg/jev/backends.json' ? config : undefined),
    secret: async () => undefined, home: async () => '/home/x', now: () => 0, sleep: async () => {},
    post: async () => ({ status: 200, headers: {}, text: JSON.stringify({ answers: { ok: { type: 'noul', noul: n++ % 2 ? 0.8 : 0.2 } } }) }),
  }
  for (let i = 0; i < 20; i++) await ask(host, 'x', { ok: noul('It worked') })
  await record(fake, { calls: 20, cost: 0, error: null })
  expect(memory.space<JevSpace>('jev').warning).toContain('von')
  resetSeen()
  await record(fake, { calls: 1, cost: 0, error: null })
  expect(memory.space<JevSpace>('jev').warning).toBe(undefined)
})
