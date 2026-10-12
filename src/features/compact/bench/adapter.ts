// /jev-mod compact's decision-level bench (src/bench/README.md): each synthetic session in
// cases.ts goes through the feature's own path (keep.ts's units, engine/compact.ts's requests),
// and every text's keep/drop answer and confidence is recorded. A sweep of the drop confidence
// (the feature's 0.5) is then computed from those answers with keep.ts's keepOnly, so a sweep
// costs one pass.
//
// Scored per message Jev judges keep or drop: one with text and no tool call or result, outside
// the last six (always kept); positive = dropped. A message labelled keep that is dropped is the
// costly mistake (counted as "keep lost"). A message holding a tool call or result is decided by
// its pairs (engine/compact.ts's `trim`: keep or drop, and how far to trim), which this bench does
// not ask, so it is not scored here.

import { DROP_CONFIDENCE, select } from '../../../engine/compact'
import { scores } from '../../../bench/metrics'
import type { DecisionAdapter, Item, Metrics, Row } from '../../../bench/types'
import { ALWAYS_KEEP_LAST, keepOnly, unitsOf, type Msg, type Unit } from '../keep'
import { SESSIONS, type Gold, type Session } from './cases'

/** A message with its text replaced by whether it has one: all keepOnly reads, and safe to store. */
type Skeleton = { i: number; role: string; text: string; toolUses?: { tool_use_id: string }[]; toolResults?: { tool_use_id: string }[] }

const strip = (messages: readonly Msg[]): Msg[] => messages.map(({ role, text, toolUses, toolResults }) =>
  ({ role, text, ...(toolUses ? { toolUses } : {}), ...(toolResults ? { toolResults } : {}) }))

function skeleton(messages: readonly Msg[]): Skeleton[] {
  return messages.map((m, i) => ({
    i, role: m.role, text: m.text.trim() ? 'x' : '',
    ...(m.toolUses ? { toolUses: m.toolUses.map(u => ({ tool_use_id: u.tool_use_id })) } : {}),
    ...(m.toolResults ? { toolResults: m.toolResults.map(r => ({ tool_use_id: r.tool_use_id })) } : {}),
  }))
}

type Detail = { skeleton: Skeleton[]; gold: Gold[]; units: Unit[]; scores: (number | null)[] }

/** Messages kept at a threshold: units whose drop confidence reaches it are dropped, the rest kept. */
export function keptAt(d: Detail, threshold: number): Set<number> {
  const fates: Record<string, string> = {}
  d.scores.forEach((s, j) => { if (s !== null) fates[String(j)] = s >= threshold - 1e-12 ? 'drop' : 'keep' })
  return new Set(keepOnly(d.skeleton, d.units, fates).map(m => m.i))
}

export function metricsOf(details: readonly Detail[], threshold: number): Metrics {
  const c = { tp: 0, fp: 0, tn: 0, fn: 0 }
  for (const d of details) {
    const kept = keptAt(d, threshold)
    const tail = Math.max(0, d.skeleton.length - ALWAYS_KEEP_LAST)
    // a row recorded before tool results were trimmed also holds tool pairs as units: not scored now
    for (const { text: i } of d.units) {
      if (typeof i !== 'number' || i >= tail) continue
      const dropped = !kept.has(i)
      const drop = d.gold[i] === 'drop'
      if (dropped && drop) c.tp++
      else if (dropped) c.fp++
      else if (drop) c.fn++
      else c.tn++
    }
  }
  const total = c.tp + c.fp + c.tn + c.fn
  return { ...c, ...scores(c), effect: total ? (c.tp + c.fp) / total : 0, extra: { 'keep lost': c.fp }, cases: details.length }
}

export const adapter: DecisionAdapter<Session> = {
  feature: 'compact',
  title: '/jev-mod compact',
  explain: {
    oneCase: "a made-up coding session, each message labelled keep or drop by a careful person (keep: a decision, a constraint, an exact path or error; drop: chatter, superseded attempts).",
    measured: "for each message with text and no tool call or result (a tool call with its result is judged as a pair, not scored here), outside the last six (always kept), whether Jev's keep or drop call matches the label. Dropping a message labelled keep is the costly mistake: it cannot be had back.",
    setting: "how sure Jev must be that a message can go before /jev-mod compact drops it. Higher keeps more.",
    result: "Jev makes the same keep or drop call as the label on {pct} of the messages in {n} sessions",
    columns: {"keep lost": "messages labelled keep that were dropped: the costly mistake."},
  },
  effect: 'messages dropped',
  threshold: {
    name: 'drop', default: DROP_CONFIDENCE, from: 0.5, to: 0.95, step: 0.05, safer: 'higher',
    saferMeans: 'a higher bar keeps more, and a dropped message cannot be had back',
    where: { none: 'no setting yet: DROP_CONFIDENCE in src/engine/compact.ts (0.5) is every backend\'s; a bench run sets it with the overlay\'s compact.dropConfidence' },
  },
  cases: () => SESSIONS,
  caseId: s => s.id,
  async judge(session, ctx) {
    const messages = strip(session.messages)
    const { units, toJev } = unitsOf(messages)
    // every drop counts here: the bar is applied later, per threshold
    const out = await select(ctx.host, toJev, { keepLast: 0, timeoutMs: ctx.timeoutMs, dropConfidence: 0 })
    const unitScores: (number | null)[] = units.map(() => null)
    for (const call of out.calls ?? []) {
      for (const [name, answer] of Object.entries(call.answers)) {
        const j = Number(name.slice(1))
        if (answer.type === 'choice' && Number.isInteger(j) && j < units.length) unitScores[j] = answer.choice === 'drop' ? answer.confidence : -1
      }
    }
    const gold = session.messages.map(m => m.gold)
    const items: Item[] = units.map((u, j) => ({
      id: `m${u.text}`, gold: gold[u.text] === 'drop',
      score: unitScores[j] === null || unitScores[j]! < 0 ? null : unitScores[j]!,
    }))
    // -1 marks "judged keep": scored, never dropped; null is unjudged
    const detail: Detail = { skeleton: skeleton(messages), gold, units, scores: unitScores.map(s => (s === null ? null : s)) }
    return { items, detail: detail as unknown as Record<string, unknown>, calls: out.calls ?? [], errors: out.errors }
  },
  truth(session, _state, question) {
    const messages = strip(session.messages)
    const { units } = unitsOf(messages)
    const unit = units[Number(question.slice(1))]
    if (!unit) return undefined
    return session.messages[unit.text]?.gold
  },
  evaluate(rows: readonly Row[], threshold: number): Metrics {
    const details = rows.filter(r => r.outcome === 'ok' && r.detail).map(r => r.detail as unknown as Detail)
    return metricsOf(details, threshold)
  },
}
