import { test, expect } from 'claude-code/testing'
import { fakeHostFor, runDecision } from '../../../bench/decision'
import { adapter, fetchPlan } from './adapter'
import { CASES } from './cases'

const meta = { schema: 1 as const, run: 'r', feature: 'web-filter', level: 'decision' as const, jevmod: '0.12.0', git: 'abc', date: 'd', settings: {}, sweep: null }
const run = (only?: string[]) => runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'fake-jev' }, hostFor: fakeHostFor(adapter), meta, timeoutMs: 3000, settings: {}, only })

test('the cases have unique ids, both paths, and results and parts both wanted and not', () => {
  expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
  expect(CASES.some(c => c.kind === 'search')).toBe(true)
  expect(CASES.some(c => c.kind === 'fetch')).toBe(true)
  for (const c of CASES) {
    if (c.kind === 'fetch') {
      expect(c.sections.reduce((n, s) => n + s.text.length, 0)).toBeGreaterThanOrEqual(4000) // fetchMinChars
      expect(c.sections.some(s => s.needed)).toBe(true)
      expect(c.sections.some(s => !s.needed)).toBe(true)
      expect(fetchPlan(c).ask.length).toBeGreaterThan(0)
    } else {
      expect(c.hits.some(h => h.helps)).toBe(true)
      expect(c.hits.some(h => !h.helps)).toBe(true)
    }
  }
})

test('on the fake backend each question is one item, scored by the chance of no, in the filter\'s own request', async () => {
  const rows = await run()
  expect(rows.every(r => r.outcome === 'ok')).toBe(true)
  const items = rows.flatMap(r => r.items)
  expect(items.length).toBeGreaterThanOrEqual(40)
  expect(items.some(i => i.gold) && items.some(i => !i.gold)).toBe(true)
  for (const item of items) expect(typeof item.score).toBe('number')
  // a bar above every answer drops nothing; a bar of 0 drops every question
  expect(adapter.evaluate(rows, 1.01).effect).toBe(0)
  expect(adapter.evaluate(rows, 0).effect).toBe(1)
  const at = adapter.evaluate(rows, adapter.threshold.default)
  expect(at.tp + at.fp + at.tn + at.fn).toBe(items.length)
})

test('results the filter never asks about are not items: the top results, a repeated URL, a named host', async () => {
  const [row] = await run(['search-dups'])
  const asked = row!.items.map(i => i.id)
  const dup = CASES.find(c => c.id === 'search-dups')!
  expect(dup.kind).toBe('search')
  expect(asked).not.toContain('r0') // the first keepTop
  expect(asked).not.toContain('r1') // a copy of r0's URL
  const [named] = await run(['search-hiking-named'])
  expect(named!.items.map(i => i.id)).not.toContain('r2') // rei.com is named in the request
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
})
