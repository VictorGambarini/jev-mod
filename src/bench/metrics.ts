// The sweep maths: thresholds from a `--sweep` spec, a confusion matrix from scored items, the
// metrics a report shows, latency percentiles, and the recommended threshold. Pure functions;
// metrics.test.ts holds them to hand-worked numbers.

import type { Confusion, Item, Metrics, Row, Threshold } from './types'

export type Sweep = { name: string; from: number; to: number; step: number }

/** `drop=0.5:0.95:0.05` → its parts; an Error saying what is wrong otherwise. */
export function parseSweep(spec: string): Sweep {
  const m = /^([a-zA-Z][\w.-]*)=([\d.]+):([\d.]+):([\d.]+)$/.exec(spec.trim())
  if (!m) throw new Error(`--sweep must look like name=from:to:step (drop=0.5:0.95:0.05), not ${JSON.stringify(spec)}`)
  const [from, to, step] = [Number(m[2]), Number(m[3]), Number(m[4])]
  if (![from, to, step].every(Number.isFinite) || step <= 0 || to < from) throw new Error(`--sweep ${spec}: need from <= to and a step above 0`)
  if ((to - from) / step > 1000) throw new Error(`--sweep ${spec}: more than 1000 points`)
  return { name: m[1]!, from, to, step }
}

/** The thresholds a sweep visits, from and to included, rounded so 0.1 + 0.2 lands on 0.3. */
export function thresholds(s: Pick<Sweep, 'from' | 'to' | 'step'>): number[] {
  const out: number[] = []
  const n = Math.round((s.to - s.from) / s.step)
  for (let i = 0; i <= n; i++) out.push(Math.round((s.from + i * s.step) * 1e6) / 1e6)
  if (out[out.length - 1]! < s.to - 1e-9) out.push(s.to)
  return out
}

/** Act on an item when its score reaches the threshold; no score never acts. */
export const acts = (item: Item, threshold: number) => item.score !== null && item.score >= threshold - 1e-12

/** Positive = acting (drop, refuse, cut); gold says whether acting is right. */
export function confusion(items: Iterable<Item>, threshold: number): Confusion {
  const c: Confusion = { tp: 0, fp: 0, tn: 0, fn: 0 }
  for (const item of items) {
    const act = acts(item, threshold)
    if (act && item.gold) c.tp++
    else if (act) c.fp++
    else if (item.gold) c.fn++
    else c.tn++
  }
  return c
}

export const ratio = (a: number, b: number): number | null => (b === 0 ? null : a / b)

/** Accuracy, precision, recall and F1 from a confusion matrix; null where the denominator is 0. */
export function scores(c: Confusion): Pick<Metrics, 'accuracy' | 'precision' | 'recall' | 'f1'> {
  const total = c.tp + c.fp + c.tn + c.fn
  const precision = ratio(c.tp, c.tp + c.fp)
  const recall = ratio(c.tp, c.tp + c.fn)
  const f1 = precision === null || recall === null ? null : precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return { accuracy: total ? (c.tp + c.tn) / total : 0, precision, recall, f1 }
}

/** The default metrics for a feature whose items are judged one by one (a gate): effect = share acted on. */
export function itemMetrics(rows: readonly Row[], threshold: number): Metrics {
  const ok = rows.filter(r => r.outcome === 'ok')
  const items = ok.flatMap(r => r.items)
  const c = confusion(items, threshold)
  const total = c.tp + c.fp + c.tn + c.fn
  return { ...c, ...scores(c), effect: total ? (c.tp + c.fp) / total : 0, extra: {}, cases: ok.length }
}

/** The p-th percentile (0..100) by nearest rank; null for no values. */
export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
  return sorted[Math.min(sorted.length, rank) - 1]!
}

/**
 * The recommended threshold: where accuracy peaks; among thresholds within `tie` of the peak,
 * the one furthest to the safer side (the highest when higher is safer).
 */
export function recommend(points: readonly { threshold: number; accuracy: number }[], safer: Threshold['safer'], tie = 1e-9):
  { threshold: number; accuracy: number } | null {
  if (!points.length) return null
  const best = Math.max(...points.map(p => p.accuracy))
  const near = points.filter(p => p.accuracy >= best - tie)
  const pick = near.reduce((a, b) => (safer === 'higher' ? (b.threshold > a.threshold ? b : a) : (b.threshold < a.threshold ? b : a)))
  return { threshold: pick.threshold, accuracy: pick.accuracy }
}

/** Mean of numbers, null for none. */
export function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

/**
 * A 95% Wilson score interval for k successes in n runs, as shares (0..1); null for no runs. It
 * stays inside 0..1 and is sensible at k = 0 or k = n, where the plain normal one collapses.
 */
export function wilson(k: number, n: number, z = 1.96): { lo: number; hi: number } | null {
  if (n <= 0) return null
  const p = k / n
  const z2 = z * z
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n)
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n)
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) }
}
