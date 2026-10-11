// The rules gate's decision-level bench (src/bench/README.md): each case in cases.ts is sent as
// the gate sends it (the change described and redacted by rules.ts, one yes/no per rule, and with
// the person's request a second per rule: did they give leave to break it?), and each rule's
// "broken" probability is recorded, as 0 when leave was given at the gate's waiverConfidence.
// Sweeping minConfidence is then computed from those answers. One item per rule: positive = refused.

import { ask, JevError } from '../../../engine/client'
import { itemMetrics } from '../../../bench/metrics'
import type { DecisionAdapter } from '../../../bench/types'
import { feature } from '../../../core/registry'
import { personsRequest, usableRequest } from '../../tool-gate/rules'
import { changePieces, describeChange, questionId, questionsFor, stateOf, waiverId, type Rule } from '../rules'
import { CASES, refuses, type RuleCase } from './cases'

const knob = feature('rules-gate')!.knobs
const DEFAULT = (knob.minConfidence as { default: number }).default
const CHANGE_CHARS = (knob.maxChangeChars as { default: number }).default
const WAIVER = (knob.waiverConfidence as { default: number }).default

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
    // as the gate takes it from prompt.submit: the person's own, redacted
    const given = c.request === undefined ? null : personsRequest(c.request, { kind: 'composer' })
    const request = usableRequest(given) ? given : null
    try {
      const reply = await ask(ctx.host, stateOf(change, false, request), questionsFor(rulesOf(c), request !== null), { timeoutMs: ctx.timeoutMs, retries: 1, patient: true })
      const items = c.rules.map((r, i) => {
        const a = reply.answers[questionId(i)]
        const w = reply.answers[waiverId(i)]
        const waived = w?.type === 'noul' && w.noul >= WAIVER
        return { id: questionId(i), gold: refuses(r), score: a?.type === 'noul' ? (waived ? 0 : a.noul) : null }
      })
      // the leave answers as they came, for tuning waiverConfidence
      const leave = request === null ? undefined : Object.fromEntries(c.rules.map((_, i) => {
        const w = reply.answers[waiverId(i)]
        return [waiverId(i), w?.type === 'noul' ? w.noul : null]
      }))
      return { items, calls: [reply], errors: [], ...(leave ? { detail: { leave } } : {}) }
    } catch (error) {
      if (error instanceof JevError) return { items: [], calls: [], errors: [error.code] }
      throw error
    }
  },
  truth(c, _state, question) {
    const waiver = question.startsWith('waived_')
    const i = Number(question.replace(/^(?:rule|waived)_/, '')) - 1
    return waiver ? c.rules[i]?.waived ?? false : c.rules[i]?.broken
  },
  evaluate: itemMetrics,
}
