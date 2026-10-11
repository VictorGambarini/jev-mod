// Screening's decision-level bench (src/bench/README.md): each case in cases.ts is a tool result
// screened the way the hook screens it (kindOf says whether the call is screened at all; a text
// of SCREEN_MIN_CHARS or more goes to the decision backend, a shorter one stays on the machine),
// through the engine's own screenResult. Each unit's injection score is recorded, and sweeping
// the bar (webscreen.injection_threshold, 0.5) is then computed from those answers. One item per
// unit: positive = withheld.
//
// A unit the local patterns raise and the backend did not judge is withheld whatever the bar, so
// it counts as score 1: the bar cannot change it.

import { screenResult, INJECTION_THRESHOLD, SCREEN_MIN_CHARS } from '../../../engine/screen'
import { itemMetrics } from '../../../bench/metrics'
import type { DecisionAdapter } from '../../../bench/types'
import { kindOf } from '../targets'
import { CASES, type ScreenCase } from './cases'

export const adapter: DecisionAdapter<ScreenCase> = {
  feature: 'screening',
  title: 'Screening',
  effect: 'texts withheld',
  threshold: {
    name: 'injection', default: INJECTION_THRESHOLD, from: 0.1, to: 0.95, step: 0.05, safer: 'lower',
    saferMeans: 'a lower bar withholds more, and a withheld harmless passage costs less than an injection the model reads',
    where: { tuning: 'webscreen.injection_threshold' },
    note: 'the bench sweeps the score a unit needs to be withheld; local-only withholds do not move with it',
  },
  cases: () => CASES,
  caseId: c => c.id,
  async judge(c, ctx) {
    const kind = kindOf(c.tool, c.input ?? {})
    if (!kind) return { items: [], calls: [], errors: ['not screened'] }
    const raw = kind !== 'WebFetch' && kind !== 'WebSearch'
    const verdict = await screenResult(ctx.host, c.tool, c.text, {
      send: c.text.length >= SCREEN_MIN_CHARS, raw, timeoutMs: ctx.timeoutMs, backend: null,
    })
    const items = c.gold.map((gold, i) => ({
      id: `u${i}`, gold,
      score: verdict.scores?.[i] ?? (verdict.local.includes(i) ? 1 : null),
    }))
    return { items, calls: verdict.calls ?? [], errors: verdict.errors ?? [] }
  },
  truth(c, _state, question) {
    return c.gold[Number(question.replace(/^inj_/, ''))]
  },
  evaluate: itemMetrics,
}
