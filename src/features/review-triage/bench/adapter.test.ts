import { test, expect } from 'claude-code/testing'
import { fakeHostFor, runDecision } from '../../../bench/decision'
import { projectRules } from '../index'
import { parseDiff, QUESTION_IDS } from '../triage'
import { adapter, metricsOf } from './adapter'
import { CASES } from './cases'

const meta = { schema: 1 as const, run: 'r', feature: 'review-triage', level: 'decision' as const, jevmod: '0.12.0', git: 'abc', date: 'd', settings: {}, sweep: null }
const backend = { name: 'fake', kind: 'fake' as const, model: 'fake-jev' }
const run = (only?: string[]) => runDecision({ adapter, backend, hostFor: fakeHostFor(adapter), meta, timeoutMs: 3000, settings: {}, only })

test('the cases have unique ids, parse into files, and cover quick and full changes', () => {
  expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
  for (const c of CASES) {
    expect(parseDiff(c.files.join('\n')).length, c.id).toBe(c.files.length)
    for (const q of c.yes) expect(QUESTION_IDS).toContain(q)
  }
  expect(CASES.some(c => c.yes.length === 0)).toBe(true)
  expect(CASES.filter(c => c.yes.length > 0).length).toBeGreaterThan(CASES.length / 2)
  for (const q of QUESTION_IDS) expect(CASES.some(c => c.yes.includes(q)), q).toBe(true)
})

test('the rules question is asked only for a project with rules, and the rules are read by the tool\'s own reader', async () => {
  const withRules = CASES.find(c => c.rulesFile)!
  const io = { readFile: async () => withRules.rulesFile! } as never
  expect((await projectRules(io, '/project')).length).toBeGreaterThan(0)
  const rows = await run([withRules.id, CASES.find(c => !c.rulesFile)!.id])
  const ids = (id: string) => rows.find(r => r.case === id)!.items.map(i => i.id)
  expect(ids(withRules.id)).toContain('rules')
  expect(ids(CASES.find(c => !c.rulesFile)!.id)).not.toContain('rules')
})

test('on the fake backend each question is one item, scored by its no confidence, in one request per case', async () => {
  const rows = await run()
  expect(rows.every(r => r.outcome === 'ok' && r.calls === 1)).toBe(true)
  rows.forEach((r, i) => {
    for (const item of r.items) {
      expect(item.gold).toBe(!CASES[i]!.yes.includes(item.id as never))
      expect(typeof item.score).toBe('number')
    }
  })
  // a bar above every answer calls nothing quick; a bar of 0 calls everything quick
  expect(metricsOf(rows, 1.01).effect).toBe(0)
  expect(metricsOf(rows, 0).effect).toBe(1)
  const at = adapter.evaluate(rows, adapter.threshold.default)
  expect(at.cases).toBe(CASES.length)
  expect(at.tp + at.fp + at.tn + at.fn).toBe(CASES.length)
  expect(at.extra['full skipped']).toBe(at.fp)
})

test('a case is quick only when every question reaches the bar', () => {
  const row = (scores: (number | null)[]) => ({ outcome: 'ok', items: scores.map((score, i) => ({ id: `q${i}`, gold: true, score })) }) as never
  expect(metricsOf([row([0.9, 0.85])], 0.8).tp).toBe(1)
  expect(metricsOf([row([0.9, 0.7])], 0.8).fn).toBe(1)
  expect(metricsOf([row([0.9, null])], 0.8).fn).toBe(1) // an unanswered question is unsure
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
