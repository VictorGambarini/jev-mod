import { test, expect } from 'claude-code/testing'
import { fakeHostFor, runDecision } from '../../../bench/decision'
import { adapter } from './adapter'
import { CASES } from './cases'
import { readClaims, unfinishedStep } from '../gate'

const meta = { schema: 1 as const, run: 'r', feature: 'stop-gate', level: 'decision' as const, jevmod: '0.12.0', git: 'abc', date: 'd', settings: {}, sweep: null }
const run = (only?: string[]) => runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'fake-jev' }, hostFor: fakeHostFor(adapter), meta, timeoutMs: 3000, settings: {}, ...(only ? { only } : {}) })

test('the cases have unique ids and cover each verdict, attributed claims and plans', () => {
  expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
  for (const claim of ['none', 'shown', 'not-shown', 'could-not-tell']) expect(CASES.some(c => c.claim === claim)).toBe(true)
  expect(CASES.some(c => c.short)).toBe(true)
  expect(CASES.some(c => readClaims(c.final).attributed.length > 0)).toBe(true)
  expect(CASES.some(c => c.claim === 'none' && !readClaims(c.final).claims.length && /\b(?:once|if|will)\b/.test(c.final))).toBe(true)
})

test('on the fake backend a message with claims is one request, a step it stopped on another, neither none', async () => {
  const rows = await run()
  expect(rows.every(r => r.outcome === 'ok')).toBe(true)
  for (const [i, r] of rows.entries()) {
    const c = CASES[i]!
    expect(r.items.find(x => x.id === 'claims')!.gold).toBe(c.claim === 'not-shown')
    expect(r.items.find(x => x.id === 'short')?.gold ?? false).toBe(c.short === true)
    if (!readClaims(c.final).claims.length && !unfinishedStep(c.final)) expect(r.calls).toBe(0)
  }
  expect(rows.some(r => r.calls === 2)).toBe(true)
})

test('a result attributed to someone else and a plan are never put to the decision model', async () => {
  const ids = ['none-attributed-agent', 'none-attributed-log', 'none-plan-once-ci', 'none-conditional']
  const rows = await run(ids)
  expect(rows).toHaveLength(ids.length)
  for (const r of rows) expect(r.calls).toBe(0)
})

test('a message with a secret-shaped word in its evidence is skipped, as the gate skips it', async () => {
  const [row] = await run(['skipped-secret-in-output'])
  expect(row!.calls).toBe(0)
  expect((row!.detail as { skipped?: string }).skipped).toBe('secret')
})

test('the sweep is the gate\'s own decide(): a bar of 1.01 sends nothing back, and every item is counted once', async () => {
  const rows = await run()
  const high = adapter.evaluate(rows, 1.01)
  expect(high.effect).toBe(0)
  const m = adapter.evaluate(rows, adapter.threshold.default)
  expect(m.tp + m.fp + m.tn + m.fn).toBe(rows.flatMap(r => r.items).length)
  expect(m.extra['claim items']).toBe(CASES.length)
})

test('a backend that does not answer leaves the case an error with its code, and no items', async () => {
  const down = () => ({ env: async (n: string) => ({ JEV_BACKEND: 'fake', JEV_BACKENDS: '/b.json' } as Record<string, string>)[n],
    readFile: async () => JSON.stringify({ backends: { fake: { url: 'http://127.0.0.1:9/v1/systemone', model: 'm' } } }),
    secret: async () => undefined, home: async () => '/h', now: () => 0, sleep: async () => {},
    post: async () => { throw new Error('refused') } })
  const rows = await runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'm' }, hostFor: down, meta, timeoutMs: 3000, settings: {}, only: ['shown-tests-pass'] })
  expect(rows[0]!.outcome).toBe('error')
  expect(['network', 'loading']).toContain(rows[0]!.error)
  expect(rows[0]!.items).toEqual([])
})
