// Review triage's decision-level bench (src/bench/README.md): each case in cases.ts is sent as
// the tool sends it (the diff split, redacted and cut by triage.ts and index.ts's requestOf, the
// project's rules read by projectRules, the same questions), and each question's yes probability
// is recorded. Sweeping minConfidence (the tool's 0.8) is then computed from those answers.
//
// One item per question, scored 1 - p(yes): the confidence of its "no". The tool says quick only
// when every asked question is a confident no, so a case is quick at a threshold when all its
// items reach it, and the metrics are per case. Positive = quick. A change that needs a full
// review and is called quick is the costly mistake ("full skipped"). The follow-up request that
// names the files behind a flag is not benched: it changes no verdict.

import { ask, JevError } from '../../../engine/client'
import { acts, scores } from '../../../bench/metrics'
import type { DecisionAdapter, Metrics, Row } from '../../../bench/types'
import { feature } from '../../../core/registry'
import type { IO } from '../../../core/io'
import { projectRules, requestOf, summaryOf } from '../index'
import { describeSource, parseDiff, questionsOf, statsOf, type Source } from '../triage'
import { CASES, type TriageCase } from './cases'

const knob = feature('review-triage')!.knobs
const num = (name: string) => (knob[name] as { default: number }).default
const DEFAULT = num('minConfidence')
const SOURCE: Source = { kind: 'uncommitted' }
const ROOT = '/project'

/** The project root as the tool sees it: only the rules file can be read. */
const ioOf = (c: TriageCase) => ({
  readFile: async (path: string) => {
    if (path === `${ROOT}/CLAUDE.md` && c.rulesFile) return c.rulesFile
    throw new Error('not there')
  },
}) as unknown as IO

/** Whether a case is quick at a threshold: every asked question a confident no. */
const quickAt = (r: Row, threshold: number) => r.items.length > 0 && r.items.every(i => acts(i, threshold))

export function metricsOf(rows: readonly Row[], threshold: number): Metrics {
  const ok = rows.filter(r => r.outcome === 'ok')
  const c = { tp: 0, fp: 0, tn: 0, fn: 0 }
  for (const r of ok) {
    const quick = quickAt(r, threshold)
    const right = r.items.every(i => i.gold) // nothing to flag: a quick pass is enough
    if (quick && right) c.tp++
    else if (quick) c.fp++
    else if (right) c.fn++
    else c.tn++
  }
  const total = ok.length
  return { ...c, ...scores(c), effect: total ? (c.tp + c.fp) / total : 0, extra: { 'full skipped': c.fp }, cases: total }
}

export const adapter: DecisionAdapter<TriageCase> = {
  feature: 'review-triage',
  title: 'Review triage',
  explain: {
    oneCase: "a change (a git diff) with its intent and the project's written rules, and whether it needs a full review or one quick pass is enough.",
    measured: "whether Jev calls a change quick only when it is. Calling a change quick that needs a full review skips the review: that is the costly mistake. Calling a quick one full only costs time.",
    setting: "how sure Jev must be, on every one of seven questions, that nothing is wrong before the change is called quick. Higher means fewer quick calls.",
    result: "Jev makes the right quick or full call on {pct} of the {n} changes",
    columns: {"full skipped": "changes that needed a full review but were called quick."},
  },
  effect: 'changes called quick',
  threshold: {
    name: 'minConfidence', default: DEFAULT, from: 0.5, to: 0.95, step: 0.05, safer: 'higher',
    saferMeans: 'a higher bar answers quick less often, and a full review costs only time; a wrongly quick one skips a review',
    where: { knob: { feature: 'review-triage', name: 'minConfidence' } },
  },
  cases: () => CASES,
  caseId: c => c.id,
  async judge(c, ctx) {
    const maxChars = typeof ctx.settings.maxDiffChars === 'number' ? ctx.settings.maxDiffChars : num('maxDiffChars')
    const files = parseDiff(c.files.join('\n'))
    const stats = statsOf(files)
    const rules = await projectRules(ioOf(c), ROOT)
    const request = requestOf(files, SOURCE, stats, summaryOf(files, maxChars), c.intent ?? '', rules, maxChars)
    const questions = questionsOf(Boolean(c.intent), rules.length > 0)
    try {
      const reply = await ask(ctx.host, request.state, questions, { timeoutMs: ctx.timeoutMs, retries: 1, patient: true })
      const items = Object.keys(questions).map(id => {
        const a = reply.answers[id]
        return { id, gold: !c.yes.includes(id as never), score: a?.type === 'noul' ? Math.round((1 - a.noul) * 1e4) / 1e4 : null }
      })
      return { items, detail: { source: describeSource(SOURCE), files: files.length, withheld: request.summary.withheld.length, incomplete: request.incomplete }, calls: [reply], errors: [] }
    } catch (error) {
      if (error instanceof JevError) return { items: [], calls: [], errors: [error.code] }
      throw error
    }
  },
  truth(c, _state, question) {
    return c.yes.includes(question as never)
  },
  evaluate: metricsOf,
}
