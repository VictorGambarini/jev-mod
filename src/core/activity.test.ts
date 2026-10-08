import { test, expect } from 'claude-code/testing'
import { activity, count, dayOf, KEEP_DAYS } from './activity'
import type { IO } from './io'

function store(): IO & { kept: Record<string, unknown>; writes: number } {
  const fake = {
    kept: {} as Record<string, unknown>, writes: 0,
    storeGet: async (key: string) => fake.kept[key],
    storeSet: async (key: string, value: unknown) => { fake.writes++; fake.kept[key] = JSON.parse(JSON.stringify(value)) },
  }
  return fake as unknown as IO & { kept: Record<string, unknown>; writes: number }
}

const NOW = new Date(2026, 9, 9, 15, 0).getTime()
const DAY = 24 * 3600_000

test('counts add up by local day and feature, with cost, even when features count at once', async () => {
  const io = store()
  await Promise.all([count(io, 'routing', 'small', 1, 0, NOW), count(io, 'skills', 'asked', 1, 0.00002, NOW),
    count(io, 'routing', 'small', 1, 0, NOW), count(io, 'skills', 'asked', 2, 0.00004, NOW)])
  await count(io, 'screening', 'would-withhold', 3, 0, NOW - DAY)
  const got = await activity(io, 7, NOW)
  expect(Object.keys(got)).toEqual(['2026-10-08', '2026-10-09'])
  const today = got['2026-10-09'] ?? {}
  expect(today.routing).toEqual({ small: 2 })
  expect(today.skills?.asked).toBe(3)
  expect(Math.abs((today.skills?.cost ?? 0) - 0.00006)).toBeLessThan(1e-12)
  expect(got['2026-10-08']).toEqual({ screening: { 'would-withhold': 3 } })
  expect(io.writes).toBeLessThan(5)
})

test('a window of days, and only the last 30 kept', async () => {
  const io = store()
  io.kept.activity = { '2026-01-01': { routing: { kept: 1 } } }
  await count(io, 'routing', 'kept', 1, 0, NOW - 3 * DAY)
  await count(io, 'routing', 'kept', 1, 0, NOW)
  expect(Object.keys(io.kept.activity as object)).toEqual(['2026-10-06', '2026-10-09'])
  expect(Object.keys(await activity(io, 1, NOW))).toEqual([dayOf(NOW)])
  expect(Object.keys(await activity(io, 4, NOW))).toEqual(['2026-10-06', '2026-10-09'])
  expect(KEEP_DAYS).toBe(30)
})

test('a store that fails or holds something else reads as nothing', async () => {
  const io = store()
  io.kept.activity = ['not', 'counts']
  expect(await activity(io, 7, NOW)).toEqual({})
  const broken = { storeGet: async () => { throw new Error('no store') }, storeSet: async () => { throw new Error('no store') } } as unknown as IO
  await count(broken, 'skills', 'suggested', 1, 0, NOW)
  expect(await activity(broken, 7, NOW)).toEqual({})
})
