// The rules gate's decision-level bench (src/bench/README.md): each case in cases.ts is sent as
// the gate sends it (the change described and redacted by rules.ts, one yes/no per rule), and
// each rule's "broken" probability is recorded. Sweeping minConfidence (the gate's 0.8) is then
// computed from those answers. One item per rule: positive = refused.

import { ask, JevError } from '../../../engine/client'
import { itemMetrics } from '../../../bench/metrics'
import type { DecisionAdapter } from '../../../bench/types'
import { feature } from '../../../core/registry'
import { changePieces, describeChange, questionId, questionsFor, stateOf, type Rule } from '../rules'
import { CASES, type RuleCase } from './cases'

const knob = feature('rules-gate')!.knobs
const DEFAULT = (knob.minConfidence as { default: number }).default
const CHANGE_CHARS = (knob.maxChangeChars as { default: number }).default

const rulesOf = (c: RuleCase): Rule[] => c.rules.map(r => ({ text: r.text, source: r.source, heading: r.heading ?? '' }))

export const adapter: DecisionAdapter<RuleCase> = {
  feature: 'rules-gate',
  title: 'Rules gate',
  explain: {
    oneCase: "an edit to a file in a project, with the written rules that apply to that file, and for each rule whether the edit breaks it.",
    measured: "for each rule, whether Jev says broken when it is. Refusing an edit that breaks no rule is a wasted turn; letting a breaking one through is the miss.",
    setting: "how sure Jev must be that a rule is broken before the edit is refused. Higher refuses fewer edits, and a doubtful one goes on.",
    result: "Jev judges the rules right on {pct} of the rule checks over {n} edits",
  },
  effect: 'rules judged broken',
  threshold: {
    name: 'minConfidence', default: DEFAULT, from: 0.5, to: 0.95, step: 0.05, safer: 'higher',
    saferMeans: 'a higher bar refuses fewer edits, and the mod fails open: a doubtful edit goes on',
    where: { knob: { feature: 'rules-gate', name: 'minConfidence' } },
  },
  cases: () => CASES,
  caseId: c => c.id,
  async judge(c, ctx) {
    const maxChars = typeof ctx.settings.maxChangeChars === 'number' ? ctx.settings.maxChangeChars : CHANGE_CHARS
    const change = describeChange(c.file, c.tool, changePieces(c.tool, c.input, c.existing ?? null), maxChars)
    if (!change) return { items: [], calls: [], errors: ['nothing to judge'] }
    try {
      const reply = await ask(ctx.host, stateOf(change, false), questionsFor(rulesOf(c)), { timeoutMs: ctx.timeoutMs, retries: 1, patient: true })
      const items = c.rules.map((r, i) => {
        const a = reply.answers[questionId(i)]
        return { id: questionId(i), gold: r.broken, score: a?.type === 'noul' ? a.noul : null }
      })
      return { items, calls: [reply], errors: [] }
    } catch (error) {
      if (error instanceof JevError) return { items: [], calls: [], errors: [error.code] }
      throw error
    }
  },
  truth(c, _state, question) {
    const i = Number(question.replace(/^rule_/, '')) - 1
    return c.rules[i]?.broken
  },
  evaluate: itemMetrics,
}
