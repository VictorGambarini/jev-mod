import { test, expect } from 'claude-code/testing'
import { fakeHost } from '../../../bench/fake'
import { fakeHostFor, runDecision } from '../../../bench/decision'
import type { Row } from '../../../bench/types'
import { isSensitive } from '../../../engine/privacy'
import { askAbout } from '../index'
import { termsOf } from '../rank'
import { adapter } from './adapter'
import { FILES, QUERIES } from './cases'

const meta = { schema: 1 as const, run: 'r', feature: 'find-files', level: 'decision' as const, jevmod: '0.12.0', git: 'abc', date: 'd', settings: {}, sweep: null }

async function fakeRows(): Promise<Row[]> {
  return runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'fake-jev' }, hostFor: fakeHostFor(adapter), meta, timeoutMs: 3000, settings: {} })
}

test('the project and queries are consistent: ids unique, named files exist, nothing in them looks secret', () => {
  expect(new Set(QUERIES.map(q => q.id)).size).toBe(QUERIES.length)
  expect(QUERIES.length).toBeGreaterThanOrEqual(40)
  for (const q of QUERIES) {
    expect(isSensitive(q.query)).toBe(false)
    for (const p of [...q.implements, ...(q.related ?? [])]) expect(Object.keys(FILES)).toContain(p)
  }
  for (const [path, text] of Object.entries(FILES)) expect(isSensitive(`path: ${path}\n${text}`)).toBe(false)
  expect(QUERIES.some(q => q.implements.length === 0)).toBe(true)
  expect(QUERIES.some(q => q.implements.length > 1)).toBe(true)
  expect(QUERIES.some(q => q.borderline)).toBe(true)
})

test('on the fake backend each query is answered through the tool\'s own steps, and rows keep paths but no file text', async () => {
  const rows = await fakeRows()
  expect(rows.every(r => r.outcome === 'ok' && r.fake === true)).toBe(true)
  // a query whose words match nothing has no candidate to ask about, and costs no request
  expect(rows.filter(r => r.calls === 0).length).toBeLessThan(5)
  expect(rows.reduce((n, r) => n + r.calls, 0)).toBeGreaterThan(30)
  const d = rows[0]!.detail as { gold: string[]; shown: string[]; local: string[]; candidates: string[] }
  expect(d.gold).toEqual(QUERIES[0]!.implements)
  expect(d.candidates).toContain('src/net/retry.ts')
  expect(d.shown.every(p => d.candidates.includes(p))).toBe(true)
  expect(JSON.stringify(rows)).not.toContain('exponential backoff and jitter')
  // the fake leans to the gold file, so most queries with one are answered by a returned file
  expect(adapter.evaluate(rows, 10).extra['queries with a hit']).toBeGreaterThan(0.6)
})

test('a higher limit never returns fewer files; the counts add up at every limit; a limit of 0 returns none', async () => {
  const rows = await fakeRows()
  let last = -1
  let sum: number | null = null
  for (const k of [0, 1, 3, 5, 10, 20]) {
    const m = adapter.evaluate(rows, k)
    expect(m.effect).toBeGreaterThanOrEqual(last)
    last = m.effect
    const all = m.tp + m.fp + m.tn + m.fn
    if (sum === null) sum = all
    expect(all).toBe(sum)
    expect(m.cases).toBe(QUERIES.length)
  }
  expect(adapter.evaluate(rows, 0).tp + adapter.evaluate(rows, 0).fp).toBe(0)
  // more files can only find more of the gold
  expect(adapter.evaluate(rows, 20).tp).toBeGreaterThanOrEqual(adapter.evaluate(rows, 1).tp)
})

test('askAbout never sends a card that looks like it holds a secret, and says so when none can go', async () => {
  const host = fakeHost(() => 'unrelated')
  const bad = { path: 'src/k.ts', score: 1, head: { header: 'api key sk-live-AbCdEf0123456789AbCdEf0123456789', symbols: [], imports: [], lines: [] } }
  const none = await askAbout(host, undefined, 'where is x', [bad], termsOf('where is x'), 1000)
  expect(none.allSensitive).toBe(true)
  expect(host.posts).toBe(0)
})

test('a backend that does not answer leaves the case an error with its code, and no items', async () => {
  const down = () => ({ env: async (n: string) => ({ JEV_BACKEND: 'fake', JEV_BACKENDS: '/b.json' } as Record<string, string>)[n],
    readFile: async () => JSON.stringify({ backends: { fake: { url: 'http://127.0.0.1:9/v1/systemone', model: 'm' } } }),
    secret: async () => undefined, home: async () => '/h', now: () => 0, sleep: async () => {},
    post: async () => { throw new Error('refused') } })
  const rows = await runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'm' }, hostFor: down, meta, timeoutMs: 3000, settings: {}, only: [QUERIES[0]!.id] })
  expect(rows).toHaveLength(1)
  expect(rows[0]!.outcome).toBe('error')
  expect(rows[0]!.items).toEqual([])
})
