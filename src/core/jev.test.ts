import { test, expect } from 'claude-code/testing'
import type { IO } from './io'
import { COOL_OFF_MS, coolingOff, failureOf, record, recordCalls, REFUSED_COOL_OFF_MS, type JevSpace } from './jev'
import * as memory from './memory'
import { OUTAGES, RETRYABLE } from '../engine/client'
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
