import { test, expect } from 'claude-code/testing'
import { fakeHostFor, runDecision } from '../../../bench/decision'
import type { Row } from '../../../bench/types'
import { META_SKILLS } from '../../../engine/skills'
import { adapter } from './adapter'
import { CASES, CATALOG } from './cases'

const meta = { schema: 1 as const, run: 'r', feature: 'skills', level: 'decision' as const, jevmod: '0.12.0', git: 'abc', date: 'd', settings: {}, sweep: null }

async function fakeRows(settings: Record<string, number> = {}): Promise<Row[]> {
  return runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'fake-jev' }, hostFor: fakeHostFor(adapter), meta, timeoutMs: 3000, settings })
}

test('the catalog and cases are consistent: unique names and ids, gold names exist, both kinds of case', () => {
  expect(new Set(CATALOG.map(s => s.name)).size).toBe(CATALOG.length)
  expect(CATALOG.some(s => META_SKILLS.includes(s.name))).toBe(false)
  expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
  expect(CASES.length).toBeGreaterThanOrEqual(40)
  for (const c of CASES) for (const g of c.gold) expect(CATALOG.map(s => s.name)).toContain(g)
  expect(CASES.filter(c => c.gold.length).length).toBeGreaterThan(20)
  expect(CASES.filter(c => !c.gold.length).length).toBeGreaterThan(10)
  expect(CASES.some(c => c.gold.length > 1)).toBe(true)
  expect(CASES.some(c => c.borderline)).toBe(true)
})

test('on the fake backend each prompt is one item, trivial turns cost no request, and no prompt text is kept', async () => {
  const rows = await fakeRows()
  expect(rows.every(r => r.outcome === 'ok')).toBe(true)
  expect(rows.every(r => r.items.length === 1)).toBe(true)
  const trivial = rows.filter(r => r.case.startsWith('trivial-'))
  expect(trivial.length).toBe(3)
  for (const r of trivial) { expect(r.calls).toBe(0); expect(r.items[0]!.score).toBeNull() }
  expect(rows.some(r => r.calls === 2)).toBe(true) // both stages
  expect(JSON.stringify(rows)).not.toContain(CASES[0]!.prompt.slice(0, 25))
  // the fake leans to the gold skill, so a good share of the needing prompts are ranked right
  expect(adapter.evaluate(rows, 0.3).extra['right skill first']).toBeGreaterThan(0.5)
})

test('a higher match bar never suggests more; at 1.01 nothing is suggested; the counts add up', async () => {
  const rows = await fakeRows()
  let last = Infinity
  for (const t of [0, 0.3, 0.5, 0.7, 0.9, 1.01]) {
    const m = adapter.evaluate(rows, t)
    expect(m.effect).toBeLessThanOrEqual(last)
    last = m.effect
    expect(m.tp + m.fp + m.tn + m.fn).toBe(CASES.length)
  }
  const none = adapter.evaluate(rows, 1.01)
  expect(none.effect).toBe(0)
  expect(none.extra['wrong skill suggested']).toBe(0)
  expect(none.extra['unneeded suggestion']).toBe(0)
  expect(adapter.evaluate(rows, 0).tp).toBeGreaterThan(0)
})

test('the need bar is a setting that moves which prompts count as suggested, and is recorded with the run', async () => {
  const loose = await fakeRows({ needThreshold: 0 })
  const strict = await fakeRows({ needThreshold: 1.01 })
  expect(adapter.evaluate(strict, 0).effect).toBe(0)
  expect(adapter.evaluate(loose, 0).effect).toBeGreaterThan(0)
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
