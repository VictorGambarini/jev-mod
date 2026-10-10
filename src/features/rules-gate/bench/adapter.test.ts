import { test, expect } from 'claude-code/testing'
import { fakeHostFor, runDecision } from '../../../bench/decision'
import { adapter } from './adapter'
import { CASES } from './cases'

const meta = { schema: 1 as const, run: 'r', feature: 'rules-gate', level: 'decision' as const, jevmod: '0.10.0', git: 'abc', date: 'd', settings: {}, sweep: null }

test('the cases have unique ids and both kinds of rule', () => {
  expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
  const rules = CASES.flatMap(c => c.rules)
  expect(rules.some(r => r.broken)).toBe(true)
  expect(rules.some(r => !r.broken)).toBe(true)
})

test('on the fake backend each rule is one item, scored by its yes probability, in the gate\'s own request', async () => {
  const rows = await runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'fake-jev' }, hostFor: fakeHostFor(adapter), meta, timeoutMs: 3000, settings: {} })
  expect(rows.every(r => r.outcome === 'ok')).toBe(true)
  rows.forEach((r, i) => {
    expect(r.items.map(x => x.gold)).toEqual(CASES[i]!.rules.map(x => x.broken))
    for (const item of r.items) expect(typeof item.score).toBe('number')
  })
  // a bar above every answer refuses nothing; a bar of 0 refuses every rule
  expect(adapter.evaluate(rows, 1.01).effect).toBe(0)
  expect(adapter.evaluate(rows, 0).effect).toBe(1)
  const at = adapter.evaluate(rows, adapter.threshold.default)
  expect(at.cases).toBe(CASES.length)
  expect(at.tp + at.fp + at.tn + at.fn).toBe(CASES.flatMap(c => c.rules).length)
})

test('a backend that does not answer leaves the case an error with its code, and no items', async () => {
  const down = () => ({ env: async (n: string) => ({ JEV_BACKEND: 'fake', JEV_BACKENDS: '/b.json' } as Record<string, string>)[n],
    readFile: async () => JSON.stringify({ backends: { fake: { url: 'http://127.0.0.1:9/v1/systemone', model: 'm' } } }),
    secret: async () => undefined, home: async () => '/h', now: () => 0, sleep: async () => {},
    post: async () => { throw new Error('refused') } })
  const rows = await runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'm' }, hostFor: down, meta, timeoutMs: 3000, settings: {}, only: [CASES[0]!.id] })
  expect(rows).toHaveLength(1)
  expect(rows[0]!.outcome).toBe('error')
  expect(['network', 'loading']).toContain(rows[0]!.error) // loading while a named backend has not answered yet
  expect(rows[0]!.items).toEqual([])
})
