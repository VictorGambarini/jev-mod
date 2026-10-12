import { test, expect } from 'claude-code/testing'
import { acts, confusion, itemMetrics, parseSweep, percentile, recommend, scores, thresholds, wilson } from './metrics'
import type { Item, Row } from './types'

const r3 = (n: number | null) => (n === null ? null : Math.round(n * 1000) / 1000)

test('a sweep spec gives its thresholds, ends included, without float drift', () => {
  const s = parseSweep('drop=0.5:0.95:0.05')
  expect(s).toEqual({ name: 'drop', from: 0.5, to: 0.95, step: 0.05 })
  expect(thresholds(s)).toEqual([0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95])
  expect(thresholds({ from: 0.1, to: 0.3, step: 0.1 })).toEqual([0.1, 0.2, 0.3])
  expect(thresholds({ from: 0.5, to: 0.5, step: 0.1 })).toEqual([0.5])
  expect(() => parseSweep('drop=0.9:0.5:0.1')).toThrow()
  expect(() => parseSweep('drop 0.5-0.9')).toThrow()
  expect(() => parseSweep('drop=0.5:0.9:0')).toThrow()
})

const items: Item[] = [
  { id: 'a', gold: true, score: 0.95 },  // act at every bar up to 0.95: tp
  { id: 'b', gold: true, score: 0.6 },   // tp at 0.6, fn above
  { id: 'c', gold: false, score: 0.7 },  // fp at 0.7 and below, tn above
  { id: 'd', gold: false, score: null }, // never acts: tn
  { id: 'e', gold: true, score: null },  // never acts: fn
]

test('an item acts when its score reaches the bar; no score never acts', () => {
  expect(acts(items[1]!, 0.6)).toBe(true)
  expect(acts(items[1]!, 0.6000001)).toBe(false)
  expect(acts(items[3]!, 0)).toBe(false)
})

test('the confusion matrix and its scores, worked by hand', () => {
  expect(confusion(items, 0.5)).toEqual({ tp: 2, fp: 1, tn: 1, fn: 1 })
  expect(confusion(items, 0.8)).toEqual({ tp: 1, fp: 0, tn: 2, fn: 2 })
  const at5 = scores(confusion(items, 0.5))
  expect(r3(at5.accuracy)).toBe(0.6)
  expect(r3(at5.precision)).toBe(0.667)
  expect(r3(at5.recall)).toBe(0.667)
  expect(r3(at5.f1)).toBe(0.667)
  const at8 = scores(confusion(items, 0.8))
  expect(at8.precision).toBe(1)
  expect(r3(at8.recall)).toBe(0.333)
  expect(at8.f1).toBe(0.5)
  // nothing acted on: precision has no denominator
  expect(scores(confusion(items, 0.99)).precision).toBe(null)
  expect(scores({ tp: 0, fp: 0, tn: 0, fn: 0 })).toEqual({ accuracy: 0, precision: null, recall: null, f1: null })
})

test('item metrics count only rows that answered, and the effect is the share acted on', () => {
  const row = (outcome: Row['outcome'], its: Item[]) => ({ outcome, items: its }) as unknown as Row
  const m = itemMetrics([row('ok', items), row('error', [{ id: 'x', gold: false, score: 1 }])], 0.5)
  expect(m.cases).toBe(1)
  expect(m.effect).toBe(3 / 5)
  expect(m.tp + m.fp + m.tn + m.fn).toBe(5)
})

test('percentiles by nearest rank', () => {
  const v = [100, 300, 200, 500, 400]
  expect(percentile(v, 50)).toBe(300)
  expect(percentile(v, 95)).toBe(500)
  expect(percentile([7], 95)).toBe(7)
  expect(percentile([], 50)).toBe(null)
})

test('the recommendation is the peak; a tie goes to the safer side', () => {
  const pts = [0.5, 0.6, 0.7, 0.8, 0.9].map((threshold, i) => ({ threshold, accuracy: [0.7, 0.8, 0.8, 0.8, 0.6][i]! }))
  expect(recommend(pts, 'higher')).toEqual({ threshold: 0.8, accuracy: 0.8 })
  expect(recommend(pts, 'lower')).toEqual({ threshold: 0.6, accuracy: 0.8 })
  expect(recommend([], 'higher')).toBe(null)
  // within the tie band counts as a tie
  expect(recommend([{ threshold: 0.5, accuracy: 0.8 }, { threshold: 0.9, accuracy: 0.7995 }], 'higher', 1e-3)!.threshold).toBe(0.9)
})

test('the Wilson interval: hand-worked values, inside 0..1 at none and all, null for no runs', () => {
  const at = (k: number, n: number) => { const w = wilson(k, n)!; return [r3(w.lo), r3(w.hi)] }
  expect(at(5, 10)).toEqual([0.237, 0.763])
  expect(at(10, 10)).toEqual([0.722, 1])
  expect(at(0, 10)).toEqual([0, 0.278])
  expect(at(2, 3)).toEqual([0.208, 0.939])
  // more runs, a narrower interval at the same share
  expect(wilson(30, 60)!.hi - wilson(30, 60)!.lo).toBeLessThan(wilson(5, 10)!.hi - wilson(5, 10)!.lo)
  expect(wilson(0, 0)).toBe(null)
})
