import { test, expect } from 'claude-code/testing'
import { fakeHostFor, runDecision } from '../../../bench/decision'
import { NOT_NEEDED } from '../testlog'
import { adapter } from './adapter'
import { CASES } from './cases'
import { apply, keepFailuresOnly, prepare } from './pipeline'

const meta = { schema: 1 as const, run: 'r', feature: 'trim-output', level: 'decision' as const, jevmod: '0.10.0', git: 'abc', date: 'd', settings: {}, sweep: null }

test('the sweep at the feature\'s own bar gives exactly what the trim path keeps with those answers', async () => {
  const rows = await runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'fake-jev' }, hostFor: fakeHostFor(adapter), meta, timeoutMs: 8000, settings: {} })
  expect(rows.every(r => r.outcome === 'ok' && r.calls === 1)).toBe(true)
  const m = adapter.evaluate(rows, NOT_NEEDED)
  let lost = 0
  for (const r of rows) {
    const c = CASES.find(x => x.name === r.case)!
    lost += apply(c, r.detail!.answers as Record<string, number>).goldLost.length
  }
  expect(m.extra['gold lines lost']).toBe(lost)
  expect(m.cases).toBe(CASES.length)
  // a lower bar never cuts less
  expect(adapter.evaluate(rows, 0.5).effect).toBeGreaterThanOrEqual(m.effect)
})

test('items are the blocks asked about: acting (cutting) is right when the block holds no gold line', async () => {
  const [row] = await runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'fake-jev' }, hostFor: fakeHostFor(adapter), meta, timeoutMs: 8000, settings: {}, only: ['vitest'] })
  expect(row!.items).toHaveLength(prepare(CASES[0]!).ids.length)
  for (const item of row!.items) expect(item.score === null || (item.score >= 0 && item.score <= 1)).toBe(true)
})

test('keep failures only is a baseline row needing no backend, scored as the old benchmark did', () => {
  const baseline = adapter.baselines!(meta)
  expect(baseline.map(r => r.backend.kind)).toEqual(CASES.map(() => 'baseline'))
  const m = adapter.evaluate(baseline, NOT_NEEDED)
  expect(m.extra['gold lines lost']).toBe(CASES.reduce((n, c) => n + keepFailuresOnly(c).goldLost.length, 0))
  expect(m.extra['gold lines lost']).toBe(26)
})
