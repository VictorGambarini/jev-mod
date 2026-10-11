// trim-output's decision-level bench (src/bench/README.md): the four test logs in cases.ts, asked
// in the one request trim-output sends, each block's "needed" probability recorded. A sweep of
// the bar "not needed" must reach (the feature's 0.9) is then computed from those answers.
//
// Accuracy is per line: a gold line kept or another line cut is right. "Keep failures only" is
// recorded beside it as a baseline that needs no backend.

import { ask, JevError } from '../../../engine/client'
import { scores } from '../../../bench/metrics'
import type { DecisionAdapter, Metrics, Row, RunMeta } from '../../../bench/types'
import { NOT_NEEDED } from '../testlog'
import { linesOf } from '../trim'
import { CASES, type Case } from './cases'
import { apply, keepFailuresOnly, prepare } from './pipeline'

/** Per line: positive = cut. A gold line cut is a false positive. */
function lineMetrics(c: Case, kept: readonly string[]): { tp: number; fp: number; tn: number; fn: number; lost: number; cut: number } {
  const lines = linesOf(c.log)
  const gold = new Set(c.gold.map(g => g.trim()))
  const have = new Set(kept.map(l => l.trim()))
  const m = { tp: 0, fp: 0, tn: 0, fn: 0, lost: 0, cut: 0 }
  for (const line of lines) {
    const isGold = gold.has(line.trim())
    const isKept = have.has(line.trim())
    if (!isKept) m.cut++
    if (!isKept && !isGold) m.tp++
    else if (!isKept) m.fp++
    else if (isGold) m.tn++
    else m.fn++
  }
  m.lost = c.gold.filter(g => !have.has(g.trim())).length
  return m
}

function metricsOf(parts: { c: Case; kept: string[] }[]): Metrics {
  const sum = { tp: 0, fp: 0, tn: 0, fn: 0, lost: 0, cut: 0, lines: 0 }
  for (const { c, kept } of parts) {
    const m = lineMetrics(c, kept)
    sum.tp += m.tp; sum.fp += m.fp; sum.tn += m.tn; sum.fn += m.fn; sum.lost += m.lost; sum.cut += m.cut
    sum.lines += m.tp + m.fp + m.tn + m.fn
  }
  const conf = { tp: sum.tp, fp: sum.fp, tn: sum.tn, fn: sum.fn }
  return { ...conf, ...scores(conf), effect: sum.lines ? sum.cut / sum.lines : 0, extra: { 'gold lines lost': sum.lost }, cases: parts.length }
}

const byName = (name: string) => CASES.find(c => c.name === name)

export const adapter: DecisionAdapter<Case> = {
  feature: 'trim-output',
  title: 'Output trimming (test logs)',
  explain: {
    oneCase: "a test run's log, with the goal it is read for (\"why does this fail\"), and the lines that must survive the trim.",
    measured: "line by line, whether the trimmed output keeps the lines the goal needs and cuts the rest. Losing a needed line is the costly mistake, so the best value is the one that loses fewest, then cuts most.",
    setting: "how sure Jev must be that a block of lines is not needed before it is cut. Higher cuts fewer blocks.",
    result: "Jev keeps or cuts the right lines on {pct} of the log lines over {n} logs",
    columns: {"gold lines lost": "lines the goal needs that the trim removed."},
  },
  effect: 'lines cut',
  objective: { label: 'fewest gold lines lost, then most lines cut', score: m => (m.extra['gold lines lost'] ?? 0) * -1000 + m.effect },
  threshold: {
    name: 'notNeeded', default: NOT_NEEDED, from: 0.5, to: 0.95, step: 0.05, safer: 'higher',
    saferMeans: 'a higher bar cuts fewer blocks, so fewer lines the goal needs are lost',
    where: { none: 'the test-log bar is NOT_NEEDED in src/features/trim-output/testlog.ts (0.9), one value for every backend; keepThreshold sets other output\'s' },
  },
  cases: () => CASES,
  caseId: c => c.name,
  async judge(c, ctx) {
    const { asked, ids } = prepare(c)
    if (!asked) return { items: [], detail: { answers: {} }, calls: [], errors: [] }
    try {
      const reply = await ask(ctx.host, asked.state, asked.questions, { timeoutMs: ctx.timeoutMs, retries: 1, patient: true })
      const answers: Record<string, number> = {}
      for (const [q, a] of Object.entries(reply.answers)) if (a.type === 'noul') answers[q] = a.noul
      const chunks = asked.state.chunks as Record<string, string>
      const gold = c.gold.map(g => g.trim())
      const items = ids.map(id => {
        const text = chunks[`C${id}`] ?? ''
        const holdsGold = text.split('\n').some(l => gold.includes(l.trim()))
        const p = answers[`c${id}`]
        return { id: `c${id}`, gold: !holdsGold, score: typeof p === 'number' ? 1 - p : null }
      })
      return { items, detail: { answers }, calls: [reply], errors: [] }
    } catch (error) {
      if (error instanceof JevError) return { items: [], calls: [], errors: [error.code] }
      throw error
    }
  },
  truth(c, state, question) {
    const text = String((state.chunks as Record<string, string> | undefined)?.[`C${question.slice(1)}`] ?? '')
    const gold = c.gold.map(g => g.trim())
    return text.split('\n').some(l => gold.includes(l.trim())) // "needed"
  },
  evaluate(rows: readonly Row[], threshold: number): Metrics {
    const parts: { c: Case; kept: string[] }[] = []
    for (const r of rows) {
      const c = byName(r.case)
      if (!c || r.outcome !== 'ok') continue
      if (r.backend.kind === 'baseline') { parts.push({ c, kept: keepFailuresOnly(c).kept }); continue }
      const answers = (r.detail?.answers ?? {}) as Record<string, number>
      parts.push({ c, kept: apply(c, answers, threshold).kept })
    }
    return metricsOf(parts)
  },
  baselines(meta: RunMeta): Row[] {
    return CASES.map(c => ({
      ...meta, backend: { name: 'keep failures only', kind: 'baseline', model: null }, answered_model: null,
      case: c.name, outcome: 'ok', items: [], calls: 0, latencies_ms: [], input_tokens: null, cost_usd: 0,
    }))
  },
}
