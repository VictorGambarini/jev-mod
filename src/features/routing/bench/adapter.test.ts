import { test, expect } from 'claude-code/testing'
import { fakeHostFor, runDecision } from '../../../bench/decision'
import type { Row } from '../../../bench/types'
import { adapter, laneAt, policyAt, recordedAction } from './adapter'
import { CASES } from './cases'

const meta = { schema: 1 as const, run: 'r', feature: 'routing', level: 'decision' as const, jevmod: '0.12.0', git: 'abc', date: 'd', settings: {}, sweep: null }

async function fakeRows(): Promise<Row[]> {
  return runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'fake-jev' }, hostFor: fakeHostFor(adapter), meta, timeoutMs: 3000, settings: {} })
}

test('the cases have unique ids, every lane, borderline ones, and sensible flags', () => {
  expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
  expect(CASES.length).toBeGreaterThanOrEqual(40)
  for (const gold of ['small', 'medium', 'high', 'escalate', 'keep_current']) expect(CASES.filter(c => c.gold === gold).length).toBeGreaterThanOrEqual(5)
  expect(CASES.some(c => c.borderline)).toBe(true)
  // the policy would not answer small to a security-sensitive or vague prompt
  for (const c of CASES.filter(c => c.gold === 'small')) expect(c.security || c.vague).toBeFalsy()
})

test('the swept bar is the shipped policy\'s small-lane bar, and moving it changes only that', () => {
  expect(adapter.threshold.default).toBe(0.7)
  expect(JSON.stringify(policyAt(0.7))).toBe(JSON.stringify(policyAt(adapter.threshold.default)))
  expect(JSON.stringify(policyAt(0.9))).not.toBe(JSON.stringify(policyAt(0.7)))
})

test('on the fake backend each prompt is one request and one item, and the default bar reproduces the recorded lane', async () => {
  const rows = await fakeRows()
  expect(rows.every(r => r.outcome === 'ok' && r.items.length === 1 && r.calls === 1)).toBe(true)
  expect(rows.every(r => r.fake === true)).toBe(true)
  const reading = (r: Row) => (r.detail as { readings: Parameters<typeof laneAt>[0] }).readings
  for (const r of rows) expect(laneAt(reading(r), adapter.threshold.default)).toBe(recordedAction(r))
  // no prompt text is kept in a row
  expect(JSON.stringify(rows)).not.toContain(CASES[0]!.prompt.slice(0, 20))
  expect(rows.map(r => r.items[0]!.gold)).toEqual(CASES.map(c => c.gold === 'small'))
})

test('a higher bar never sends more prompts to small; at 1.01 none go; the metrics add up', async () => {
  const rows = await fakeRows()
  let last = Infinity
  for (const t of [0, 0.5, 0.7, 0.9, 1.01]) {
    const m = adapter.evaluate(rows, t)
    expect(m.effect).toBeLessThanOrEqual(last)
    last = m.effect
    expect(m.tp + m.fp + m.tn + m.fn).toBe(CASES.length)
    expect(m.cases).toBe(CASES.length)
    for (const k of ['under-routed', 'over-routed', 'not routed', 'effort right']) {
      expect(m.extra[k]).toBeGreaterThanOrEqual(0)
      expect(m.extra[k]).toBeLessThanOrEqual(1)
    }
  }
  expect(adapter.evaluate(rows, 1.01).effect).toBe(0)
  const at = adapter.evaluate(rows, adapter.threshold.default)
  expect(at.accuracy).toBeGreaterThan(0.3)
  expect(at.accuracy).toBeLessThan(1)
  // lowering the bar can only add under-routing, never remove it
  expect(adapter.evaluate(rows, 0.5).extra['under-routed']).toBeGreaterThanOrEqual(adapter.evaluate(rows, 0.95).extra['under-routed']!)
})

test('a backend that does not answer leaves the case an error with its code, and no items', async () => {
  const down = () => ({ env: async (n: string) => ({ JEV_BACKEND: 'fake', JEV_BACKENDS: '/b.json' } as Record<string, string>)[n],
    readFile: async () => JSON.stringify({ backends: { fake: { url: 'http://127.0.0.1:9/v1/systemone', model: 'm' } } }),
    secret: async () => undefined, home: async () => '/h', now: () => 0, sleep: async () => {},
    post: async () => { throw new Error('refused') } })
  const rows = await runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'm' }, hostFor: down, meta, timeoutMs: 3000, settings: {}, only: [CASES[0]!.id] })
  expect(rows).toHaveLength(1)
  expect(rows[0]!.outcome).toBe('error')
  expect(rows[0]!.items).toEqual([])
  expect(adapter.evaluate(rows, 0.7).cases).toBe(0)
})
