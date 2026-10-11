import { test, expect } from 'claude-code/testing'
import { fakeHostFor, runDecision } from '../../../bench/decision'
import { goalNames, riskOf } from '../rules'
import { adapter, metricsOf, tableOf } from './adapter'
import { CASES } from './cases'

const meta = { schema: 1 as const, run: 'r', feature: 'browser', level: 'decision' as const, jevmod: '0.12.0', git: 'abc', date: 'd', settings: {}, sweep: null }
const backend = { name: 'fake', kind: 'fake' as const, model: 'fake-jev' }
const run = (only?: string[]) => runDecision({ adapter, backend, hostFor: fakeHostFor(adapter), meta, timeoutMs: 3000, settings: {}, only })

test('the cases have unique ids, and the right row of the table is on offer in each', () => {
  expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
  for (const c of CASES) expect(tableOf(c).map(a => a.id), c.id).toContain(c.next)
})

test('a consequential row is one the feature itself flags, and its cases cover both answers', () => {
  const risky = CASES.filter(c => c.risky)
  for (const c of risky) {
    const action = tableOf(c).find(a => a.id === c.risky!.action)
    expect(action, c.id).toBeDefined()
    expect(riskOf(action!), c.id).not.toBeNull()
  }
  expect(risky.some(c => c.risky!.asks)).toBe(true)
  expect(risky.some(c => !c.risky!.asks)).toBe(true)
  // some goals name the action (the loop asks) and some do not (it stops unasked)
  const named = risky.filter(c => goalNames(c.goal, riskOf(tableOf(c).find(a => a.id === c.risky!.action)!)!.kinds))
  expect(named.length).toBeGreaterThan(0)
  expect(named.length).toBeLessThan(risky.length)
  expect(CASES.some(c => c.achieved === true) && CASES.some(c => c.achieved === false)).toBe(true)
  expect(CASES.some(c => c.stuck) && CASES.some(c => !c.stuck)).toBe(true)
  expect(CASES.some(c => c.reached) && CASES.some(c => !c.reached)).toBe(true)
})

test('a page with a password field is sent without its text', async () => {
  const c = CASES.find(x => x.sensitive)!
  const seen: string[] = []
  const host = fakeHostFor(adapter)(c)
  const post = host.post
  host.post = async (url, body, ...rest) => { seen.push(body); return post(url, body, ...rest) }
  await adapter.judge(c, { host, timeoutMs: 3000, settings: {} })
  expect(seen[0]).toContain('text_withheld')
  expect(seen[0]).not.toContain(c.text)
})

test('on the fake backend a case asks the step request, plus the confirm and page-check questions it has', async () => {
  const rows = await run()
  expect(rows.every(r => r.outcome === 'ok')).toBe(true)
  rows.forEach((r, i) => {
    const c = CASES[i]!
    const asked = c.risky && goalNames(c.goal, riskOf(tableOf(c).find(a => a.id === c.risky!.action)!)!.kinds) ? 1 : 0
    expect(r.calls, c.id).toBe(1 + asked + (c.achieved !== undefined ? 1 : 0))
    expect(r.items.map(x => x.id), c.id).toEqual([...(c.risky ? ['asked'] : []), ...(c.achieved !== undefined ? ['achieved'] : [])])
    for (const item of r.items) expect(item.gold).toBe(item.id === 'asked' ? c.risky!.asks : c.achieved!)
  })
  const items = rows.flatMap(r => r.items)
  expect(items.length).toBeGreaterThan(40)
  expect(items.some(i => i.score === null)).toBe(true) // asked, never: the goal did not name the action
  // a bar above every answer proceeds with nothing; a bar of 0 proceeds with every scored item
  expect(adapter.evaluate(rows, 1.01).effect).toBe(0)
  const at = adapter.evaluate(rows, adapter.threshold.default)
  expect(at.tp + at.fp + at.tn + at.fn).toBe(items.length)
  for (const key of ['next right %', 'reached right %', 'stuck right %']) {
    expect(at.extra[key]).toBeGreaterThan(0)
    expect(at.extra[key]).toBeLessThanOrEqual(100)
  }
  expect(metricsOf(rows, 0.5).cases).toBe(CASES.length)
})

test('a backend that does not answer leaves the case an error with its code, and no items', async () => {
  const down = () => ({ env: async (n: string) => ({ JEV_BACKEND: 'fake', JEV_BACKENDS: '/b.json' } as Record<string, string>)[n],
    readFile: async () => JSON.stringify({ backends: { fake: { url: 'http://127.0.0.1:9/v1/systemone', model: 'm' } } }),
    secret: async () => undefined, home: async () => '/h', now: () => 0, sleep: async () => {},
    post: async () => { throw new Error('refused') } })
  const rows = await runDecision({ adapter, backend, hostFor: down, meta, timeoutMs: 3000, settings: {}, only: [CASES[0]!.id] })
  expect(rows[0]!.outcome).toBe('error')
  expect(rows[0]!.items).toEqual([])
})
