// The access gate's decision-level bench (src/bench/README.md). The gate reads a call locally,
// with no decision model, so there are no requests and no threshold: each case in cases.ts goes
// through the gate's own functions (concerns, hitsOf, judge) and the answer is blocked or not.
// One item per case: positive = refused, score 1 for blocked and 0 for not, so every threshold
// in the sweep gives the same numbers. Run it to see what the pattern reading misses or catches
// by mistake; it is not a way to tune anything.

import { confusion, scores } from '../../../bench/metrics'
import type { DecisionAdapter, Metrics, Row } from '../../../bench/types'
import { concerns, hitsOf, judge } from '../rules'
import { CASES, type AccessCase } from './cases'

const HOME = '/home/u'

function metricsOf(rows: readonly Row[], threshold: number): Metrics {
  const ok = rows.filter(r => r.outcome === 'ok')
  const c = confusion(ok.flatMap(r => r.items), threshold)
  const total = c.tp + c.fp + c.tn + c.fn
  return { ...c, ...scores(c), effect: total ? (c.tp + c.fp) / total : 0, extra: { 'blocked in error': c.fp, missed: c.fn }, cases: ok.length }
}

export const adapter: DecisionAdapter<AccessCase> = {
  feature: 'access-gate',
  title: 'Access gate',
  explain: {
    oneCase: "a tool call (a shell command, a file read, a web fetch) with what this session has already allowed, and the answer a careful person would give: refuse it or let it through.",
    measured: "the gate reads each call locally with patterns (no decision model), so this checks its pattern reading. Letting a call reach another machine or read a key is the costly miss; refusing local work is the annoying one.",
    setting: "there is none: the gate has no confidence bar, every answer is refuse or allow, so the plot is one point.",
    result: "the gate gives the answer a careful person would on {pct} of the {n} calls",
  },
  effect: 'calls refused',
  threshold: {
    name: 'none', default: 1, from: 1, to: 1, step: 1, safer: 'higher',
    saferMeans: 'there is no threshold: the gate reads each call locally and every answer is 0 or 1',
    where: { none: 'no setting: the gate has no decision model and no confidence bar' },
  },
  cases: () => CASES,
  caseId: c => c.id,
  async judge(c) {
    const hits = concerns(c.tool) ? hitsOf(c.tool, c.input, HOME) : []
    const verdict = judge(hits, c.grants ?? {}, c.always ?? [], c.allowLocalhost !== false)
    const categories = [...new Set(verdict.blocked.map(h => h.category))]
    return { items: [{ id: 'block', gold: c.block, score: verdict.blocked.length ? 1 : 0 }], detail: { categories }, calls: [], errors: [] }
  },
  truth: () => undefined,
  evaluate: metricsOf,
}
