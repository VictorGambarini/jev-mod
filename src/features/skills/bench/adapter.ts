// The skills feature's decision-level bench (src/bench/README.md): each prompt in cases.ts is
// ranked against the catalog the way the feature does it (engine/skills.ts `pick`, topK 1, the
// same two stages and question ids), and the top skill with its match and the need score are
// recorded. Sweeping the match bar is then computed from those answers.
//
// One item per prompt. Positive = a skill is suggested. Gold = the top skill is one of the
// right ones: suggesting it is correct. A prompt whose right skill was not ranked first, or that
// needs none, is a prompt where suggesting is wrong. The need bar (skillpick.need_threshold) is
// held at its default, or at `--set needThreshold=x`, and recorded in the row.

import { tuned } from '../../../engine/backends'
import { acts, itemMetrics } from '../../../bench/metrics'
import type { DecisionAdapter, Metrics, Row } from '../../../bench/types'
import { pick } from '../../../engine/skills'
import { CASES, CATALOG, type SkillCase } from './cases'

const MATCH = tuned(null, 'skillpick.match_threshold')
const NEED = tuned(null, 'skillpick.need_threshold')

type Recorded = { gold: string[]; top: string | null; match: number | null; need: number | null; reason?: string }

const share = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : 0)

export const adapter: DecisionAdapter<SkillCase> = {
  feature: 'skills',
  title: 'Skills',
  explain: {
    oneCase: "a prompt a person might type, against a catalog of installed skills, and the skill that is the right procedure for it (or none).",
    measured: "whether Jev suggests a skill only when its top pick is a right one. A wrong suggestion costs a detour and context; a missed one costs nothing the model would not have done anyway.",
    setting: "how well the top skill must match the prompt before it is suggested. Higher suggests less often.",
    result: "Jev suggests the right skill, or none, on {pct} of the {n} prompts",
  },
  effect: 'prompts given a suggestion',
  threshold: {
    name: 'match', default: MATCH, from: 0.3, to: 0.9, step: 0.05, safer: 'higher',
    saferMeans: 'a higher bar suggests less often; a wrong suggestion costs a detour and context, a missed one costs nothing the model would not have done anyway',
    where: { tuning: 'skillpick.match_threshold' },
    note: 'the need bar (skillpick.need_threshold, 0.5) is held; set it with --set needThreshold=x',
  },
  cases: () => CASES,
  caseId: c => c.id,
  async judge(c, ctx) {
    const need = typeof ctx.settings.needThreshold === 'number' ? ctx.settings.needThreshold : NEED
    // Bars at 0: the top skill and its numbers come back whatever they are, and the bars are applied below and in evaluate.
    const picked = await pick(ctx.host, c.prompt, CATALOG, { topK: 1, needThreshold: 0, matchThreshold: 0, timeoutMs: ctx.timeoutMs })
    const calls = picked.calls ?? []
    const errors = picked.errors ?? []
    if (picked.status === 'fail_open') {
      const reason = picked.reason ?? 'fail_open'
      return { items: [], calls, errors: errors.length ? errors : [reason.includes('sensitive') ? 'sensitive_not_sent' : 'no_skills'] }
    }
    const top = picked.skills[0] ?? null
    const needed = picked.needs_skill ?? null
    const passes = top !== null && needed !== null && needed >= need - 1e-12
    const recorded: Recorded = { gold: c.gold, top: top?.name ?? null, match: top?.match ?? null, need: needed, ...(picked.skipped ? { reason: picked.skipped } : {}) }
    return {
      items: [{ id: c.id, gold: top !== null && c.gold.includes(top.name), score: passes ? top.match : null }],
      detail: recorded, calls, errors,
    }
  },
  truth(c, state, question) {
    const skills = (state.skills ?? null) as Record<string, string> | null
    if (question.startsWith('pick:')) {
      const first = c.gold[0]
      const at = first ? CATALOG.findIndex(s => s.name === first) : -1
      return at < 0 ? 'none' : `S${at}`
    }
    if (question === 'needs_skill') return c.gold.length > 0
    const m = /^s(\d+)$/.exec(question)
    if (m && skills) return c.gold.includes(CATALOG[Number(m[1])]?.name ?? '')
    return undefined
  },
  evaluate(rows, threshold): Metrics {
    const ok = rows.filter((r: Row) => r.outcome === 'ok' && r.detail)
    const base = itemMetrics(ok, threshold)
    let needing = 0, first = 0, wrong = 0, none = 0, unneeded = 0
    for (const r of ok) {
      const d = r.detail as unknown as Recorded
      const acted = acts(r.items[0]!, threshold)
      if (d.gold.length) {
        needing++
        if (d.top !== null && d.gold.includes(d.top)) first++
        else if (acted) wrong++
      } else {
        none++
        if (acted) unneeded++
      }
    }
    return { ...base, extra: {
      'right skill first': share(first, needing), 'wrong skill suggested': share(wrong, needing), 'unneeded suggestion': share(unneeded, none),
    } }
  },
}
