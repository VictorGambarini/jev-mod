import { test, expect } from 'claude-code/testing'
import { fakeHostFor, runDecision } from '../../../bench/decision'
import { adapter } from './adapter'
import { CASES } from './cases'

const meta = { schema: 1 as const, run: 'r', feature: 'access-gate', level: 'decision' as const, jevmod: '0.12.0', git: 'abc', date: 'd', settings: {}, sweep: null }
const run = () => runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'fake-jev' }, hostFor: fakeHostFor(adapter), meta, timeoutMs: 3000, settings: {} })

test('the cases have unique ids, and both calls to refuse and calls to let through', () => {
  expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
  expect(CASES.filter(c => c.block).length).toBeGreaterThan(20)
  expect(CASES.filter(c => !c.block).length).toBeGreaterThan(20)
})

test('the gate makes no request, and one item per case scores 1 for refused, 0 for not', async () => {
  const rows = await run()
  expect(rows.every(r => r.outcome === 'ok' && r.calls === 0)).toBe(true)
  rows.forEach((r, i) => {
    expect(r.items).toHaveLength(1)
    expect(r.items[0]!.gold).toBe(CASES[i]!.block)
    expect([0, 1]).toContain(r.items[0]!.score)
  })
})

test('the numbers do not depend on the threshold, and are mostly right', async () => {
  const rows = await run()
  const a = adapter.evaluate(rows, 0.5)
  expect(a).toEqual(adapter.evaluate(rows, 0.95))
  expect(a.tp + a.fp + a.tn + a.fn).toBe(CASES.length)
  expect(a.accuracy).toBeGreaterThan(0.85)
})
