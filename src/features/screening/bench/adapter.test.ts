import { test, expect } from 'claude-code/testing'
import { fakeHostFor, runDecision } from '../../../bench/decision'
import { isSensitive } from '../../../engine/privacy'
import { units } from '../../../engine/screen'
import { kindOf } from '../targets'
import { adapter } from './adapter'
import { CASES } from './cases'

const meta = { schema: 1 as const, run: 'r', feature: 'screening', level: 'decision' as const, jevmod: '0.12.0', git: 'abc', date: 'd', settings: {}, sweep: null }

test('the cases have unique ids, are screened tools, and hold both kinds of text', () => {
  expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
  for (const c of CASES) expect(kindOf(c.tool, c.input ?? {})).not.toBeNull()
  const gold = CASES.flatMap(c => c.gold)
  expect(gold.length).toBeGreaterThanOrEqual(40)
  expect(gold.some(Boolean)).toBe(true)
  expect(gold.some(g => !g)).toBe(true)
  // a short text stays on the machine; both short and long texts are in the set
  expect(CASES.some(c => c.text.length < 200)).toBe(true)
  expect(CASES.some(c => c.text.length >= 200)).toBe(true)
})

test('each case is as many units as it has gold labels', () => {
  for (const c of CASES) {
    const kind = kindOf(c.tool, c.input ?? {})!
    const found = units(c.tool, c.text, kind !== 'WebFetch' && kind !== 'WebSearch')[1]
    expect(found.length).toBe(c.gold.length)
  }
})

test('on the fake backend each unit is one item, scored by the screen\'s own request', async () => {
  const rows = await runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'fake-jev' }, hostFor: fakeHostFor(adapter), meta, timeoutMs: 3000, settings: {} })
  expect(rows.every(r => r.outcome === 'ok')).toBe(true)
  rows.forEach((r, i) => expect(r.items.map(x => x.gold)).toEqual(CASES[i]!.gold))
  // a long text was judged by the backend; a short one, or one the privacy rules hold back, was not asked about
  const asked = (i: number) => CASES[i]!.text.length >= 200 && !isSensitive(CASES[i]!.text)
  const long = rows.filter((_, i) => asked(i))
  expect(long.every(r => r.calls >= 1)).toBe(true)
  expect(rows.filter((_, i) => !asked(i)).every(r => r.calls === 0)).toBe(true)
  // a bar above every answer withholds only what the local patterns raised; a bar of 0 withholds every scored unit
  expect(adapter.evaluate(rows, 1.01).effect).toBeLessThan(adapter.evaluate(rows, 0.5).effect)
  const at = adapter.evaluate(rows, adapter.threshold.default)
  expect(at.cases).toBe(CASES.length)
  expect(at.tp + at.fp + at.tn + at.fn).toBe(CASES.flatMap(c => c.gold).length)
})

test('a backend that does not answer leaves the case an error with its code', async () => {
  const down = () => ({ env: async (n: string) => ({ JEV_BACKEND: 'fake', JEV_BACKENDS: '/b.json' } as Record<string, string>)[n],
    readFile: async () => JSON.stringify({ backends: { fake: { url: 'http://127.0.0.1:9/v1/systemone', model: 'm' } } }),
    secret: async () => undefined, home: async () => '/h', now: () => 0, sleep: async () => {},
    post: async () => { throw new Error('refused') } })
  const long = CASES.find(c => c.text.length >= 200 && !isSensitive(c.text))!
  const rows = await runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'm' }, hostFor: down, meta, timeoutMs: 3000, settings: {}, only: [long.id] })
  expect(rows).toHaveLength(1)
  expect(rows[0]!.outcome).toBe('error')
})
