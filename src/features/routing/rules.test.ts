import { test, expect } from 'claude-code/testing'
import { chooseModel, FOLLOW_UP_MS, isCorrection, sessionLane } from './rules'

const T = 1_000_000

test('a turn on its own takes the lane Jev classified', () => {
  expect(sessionLane('small', null, 'rename foo', T)).toEqual({ lane: 'small', corrections: 0, why: 'classified' })
  const stale = { lane: 'high' as const, at: T - FOLLOW_UP_MS - 1, corrections: 0 }
  expect(sessionLane('small', stale, 'rename foo', T).lane).toBe('small')
})

test('a follow-up drops one lane a turn, never more', () => {
  const after = { lane: 'high' as const, at: T - 1000, corrections: 0 }
  expect(sessionLane('small', after, 'now add a docstring', T)).toEqual({ lane: 'medium', corrections: 0, why: 'follow-up' })
  expect(sessionLane('escalate', after, 'and the rest', T).lane).toBe('escalate')
  expect(sessionLane(null, after, 'ok thanks', T).lane).toBe('medium')
})

test('a correction holds the lane, and a second climbs one', () => {
  const after = { lane: 'small' as const, at: T - 1000, corrections: 0 }
  const first = sessionLane('small', after, "that's wrong, the test still fails", T)
  expect(first).toEqual({ lane: 'small', corrections: 1, why: 'classified' })
  const second = sessionLane('small', { lane: 'small', at: T - 500, corrections: 1 }, 'still broken', T)
  expect(second).toEqual({ lane: 'medium', corrections: 2, why: 'correction' })
  const top = sessionLane('small', { lane: 'escalate', at: T - 500, corrections: 3 }, 'still wrong', T)
  expect(top.lane).toBe('escalate')
})

test('corrections are read loosely but only as corrections', () => {
  for (const text of ["that's not what I asked", 'it does not work', 'same error again', 'you missed the tests'])
    expect(isCorrection(text)).toBe(true)
  for (const text of ['add a --quiet flag', 'rename foo to bar', 'write the release notes'])
    expect(isCorrection(text)).toBe(false)
})

test('below the threshold the model follows the lane; above it only moves up', () => {
  const opus = 'claude-opus-5-5', sonnet = 'claude-sonnet-5-5', haiku = 'claude-haiku-4-5-20251001'
  expect(chooseModel(haiku, opus, 10_000, 40_000)).toBe(haiku)
  expect(chooseModel(haiku, opus, 90_000, 40_000)).toBe(opus)
  expect(chooseModel(opus, haiku, 90_000, 40_000)).toBe(opus)
  expect(chooseModel(sonnet, haiku, 90_000, 40_000)).toBe(sonnet)
  expect(chooseModel(undefined, sonnet, 90_000, 40_000)).toBe(sonnet)
})
