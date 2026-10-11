import { test, expect } from 'claude-code/testing'
import { fakeHostFor, runDecision } from '../../../bench/decision'
import { adapter, metricsOf } from './adapter'
import { CASES, shouldHold } from './cases'
import { callIsSensitive, riskOf } from '../rules'

const meta = { schema: 1 as const, run: 'r', feature: 'tool-gate', level: 'decision' as const, jevmod: '0.12.0', git: 'abc', date: 'd', settings: {}, sweep: null }
const run = (only?: string[]) => runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'fake-jev' }, hostFor: fakeHostFor(adapter), meta, timeoutMs: 3000, settings: {}, ...(only ? { only } : {}) })

test('the cases have unique ids, and holds and passes in the three routes', () => {
  expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
  const route = (c: (typeof CASES)[number]) => !riskOf(c.tool, c.input, 'all-risky', '/home/u/proj', '/home/u') ? 'unflagged' : callIsSensitive(c.tool, c.input) ? 'secret' : 'asked'
  for (const r of ['unflagged', 'secret', 'asked']) expect(CASES.some(c => route(c) === r)).toBe(true)
  expect(CASES.some(shouldHold)).toBe(true)
  expect(CASES.some(c => !shouldHold(c))).toBe(true)
})

test('on the fake backend a flagged call is one request, an unflagged or secret one none', async () => {
  const rows = await run()
  expect(rows.every(r => r.outcome === 'ok')).toBe(true)
  for (const [i, r] of rows.entries()) {
    const c = CASES[i]!
    expect(r.items.map(x => x.gold)).toEqual([shouldHold(c)])
    const d = r.detail as { route: string }
    expect(r.calls).toBe(d.route === 'asked' ? 1 : 0)
  }
  expect(rows.some(r => r.calls === 1)).toBe(true)
})

test('the sweep is the gate\'s own decide(): a secret is always held, an unflagged call never', async () => {
  const rows = await run()
  const secret = rows.filter(r => (r.detail as { route: string }).route === 'secret')
  expect(secret.length).toBeGreaterThan(0)
  for (const t of [0.5, 0.95]) {
    const m = metricsOf(rows, t)
    expect(m.tp + m.fp + m.tn + m.fn).toBe(rows.length)
    expect(m.cases).toBe(rows.length)
  }
  expect(adapter.evaluate(rows, adapter.threshold.default).accuracy).toBeGreaterThan(0.5)
})

test('a backend that does not answer leaves the case an error with its code, and no items', async () => {
  const down = () => ({ env: async (n: string) => ({ JEV_BACKEND: 'fake', JEV_BACKENDS: '/b.json' } as Record<string, string>)[n],
    readFile: async () => JSON.stringify({ backends: { fake: { url: 'http://127.0.0.1:9/v1/systemone', model: 'm' } } }),
    secret: async () => undefined, home: async () => '/h', now: () => 0, sleep: async () => {},
    post: async () => { throw new Error('refused') } })
  const asked = CASES.find(c => riskOf(c.tool, c.input, 'all-risky', '/home/u/proj', '/home/u') && !callIsSensitive(c.tool, c.input))!
  const rows = await runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'm' }, hostFor: down, meta, timeoutMs: 3000, settings: {}, only: [asked.id] })
  expect(rows[0]!.outcome).toBe('error')
  expect(['network', 'loading']).toContain(rows[0]!.error)
  expect(rows[0]!.items).toEqual([])
})
