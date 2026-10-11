// Routing's decision-level bench (src/bench/README.md): each prompt in cases.ts is classified the
// way routing classifies it (engine/lanes.ts `classify`, with the lane policy the mod ships), and
// the policy's readings of the answers are recorded. The sweep is then computed offline by laying
// the same policy's rules (policy.ts `apply`) over those readings with the "small" bar moved.
//
// There is one item per prompt. Positive = routed to the small lane; gold = small is the right
// lane. The headline accuracy is not that yes/no but exact lane accuracy over all prompts:
// routing picks one of five answers (small, medium, high, escalate, keep_current), and the
// extra columns say which way the misses go (under-routing: a lane below the gold one, so a
// cheaper model than the work needs; over-routing: a lane above it).
//
// The session rules (routing/rules.ts: follow-ups step down one lane at most, corrections hold or
// raise) are plain code, not decisions, so they are not part of this bench.

import { itemMetrics } from '../../../bench/metrics'
import type { DecisionAdapter, Metrics, Row } from '../../../bench/types'
import { LANE_POLICY_TEXT } from '../../../engine/lane-policy'
import { classify, targets } from '../../../engine/lanes'
import { apply, parse, type Policy, type Reading } from '../../../engine/policy'
import { LANES } from '../rules'
import { CASES, type Gold, type LaneCase } from './cases'

const POLICY = parse(LANE_POLICY_TEXT, 'lane', 'shipped')

type Bar = { rule: number; condition: number; value: number }

/** Where the policy keeps the small lane's confidence bar: the `lane.confidence >= x` condition of the rule that answers small. */
function smallBar(policy: Policy): Bar {
  const rule = policy.rules.findIndex(r => r.then === 'small')
  const all = policy.rules[rule]?.all ?? []
  const condition = all.findIndex(c => Array.isArray(c) && c[0] === 'lane.confidence' && c[1] === '>=')
  if (rule < 0 || condition < 0) throw new Error('the lane policy has no small-lane confidence bar to sweep')
  return { rule, condition, value: (all[condition] as unknown[])[2] as number }
}

const BAR = smallBar(POLICY)

/** The shipped policy with the small lane's bar at `value`. */
export function policyAt(value: number): Policy {
  const copy = JSON.parse(JSON.stringify(POLICY)) as Policy
  ;((copy.rules[BAR.rule]!.all as unknown[][])[BAR.condition]!)[2] = value
  return copy
}

/** The lane the policy's rules give these readings, with the small bar at `bar`. */
export function laneAt(readings: Record<string, Reading>, bar: number): string {
  return apply(policyAt(bar), readings).action
}

const order = (lane: string) => LANES.indexOf(lane as (typeof LANES)[number])
const TABLE = targets([])

type Recorded = { gold: Gold; action: string; readings: Record<string, Reading> }

export const adapter: DecisionAdapter<LaneCase> = {
  feature: 'routing',
  title: 'Routing',
  effect: 'prompts routed to small',
  threshold: {
    name: 'smallConfidence', default: BAR.value, from: 0.5, to: 0.95, step: 0.05, safer: 'higher',
    saferMeans: 'a higher bar sends fewer prompts to the cheapest model; the cost of a miss is a small model on work that needed more',
    where: { none: 'the bar is a number in the lane policy (the rule that answers small, lane.confidence >= 0.7), not a setting: a changed value goes in a policy override at ~/.config/jev/policies/lane.json' },
    note: 'accuracy is exact lane accuracy over every prompt; precision, recall and F1 are for the small lane alone',
  },
  cases: () => CASES,
  caseId: c => c.id,
  async judge(c, ctx) {
    const out = await classify(ctx.host, c.prompt, POLICY, { mode: 'shadow', timeoutMs: ctx.timeoutMs, retries: 1 })
    const d = out.decision
    if (d.status !== 'ok') return { items: [], calls: [], errors: [d.error ?? 'error'] }
    const readings = d.answers as Record<string, Reading>
    const action = d.rule_action ?? d.action
    // The small answer's confidence is what the bar is compared with, whenever the other rules let small through.
    const small = laneAt(readings, 0) === 'small'
    const lane = readings.lane
    const item = { id: c.id, gold: c.gold === 'small', score: small && lane?.kind === 'choice' ? lane.confidence : null }
    const recorded: Recorded = { gold: c.gold, action, readings }
    // Only the numbers of the readings are kept: no prompt text.
    return {
      items: [item], detail: recorded,
      calls: [{ answers: {}, usage: {}, latency_ms: d.latency_ms ?? 0, jev_model: d.jev_model, input_tokens: d.input_tokens, provider: d.provider ?? 'unknown' }],
      errors: [],
    }
  },
  truth(c, _state, question) {
    if (question === 'lane') return c.gold === 'keep_current' ? 'other' : c.gold
    if (question === 'security_sensitive') return c.security === true
    if (question === 'underspecified') return c.vague === true
    return undefined
  },
  evaluate(rows, threshold): Metrics {
    const ok = rows.filter(r => r.outcome === 'ok' && r.detail)
    const base = itemMetrics(ok, threshold)
    let exact = 0, under = 0, over = 0, unrouted = 0, effortRight = 0, routed = 0
    for (const r of ok) {
      const d = r.detail as unknown as Recorded
      const lane = laneAt(d.readings, threshold)
      if (lane === d.gold) exact++
      if (lane === 'keep_current' || d.gold === 'keep_current') {
        if (lane !== d.gold) unrouted++
        continue
      }
      routed++
      if (order(lane) < order(d.gold)) under++
      else if (order(lane) > order(d.gold)) over++
      if (TABLE[lane]?.effort === TABLE[d.gold]?.effort) effortRight++
    }
    const n = ok.length
    const share = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : 0)
    return {
      ...base, accuracy: n ? exact / n : 0, cases: n,
      extra: { 'under-routed': share(under, routed), 'over-routed': share(over, routed), 'not routed': share(unrouted, n), 'effort right': share(effortRight, routed) },
    }
  },
}

/** What a recorded row says routing picked at the shipped bar: for tests. */
export const recordedAction = (r: Row) => (r.detail as unknown as Recorded).action
