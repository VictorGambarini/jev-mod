// The completion gate's decision-level bench (src/bench/README.md): each case in cases.ts is run
// through the gate's own builders (readClaims, unfinishedStep, evidence, stateOf, questionsOf,
// shortStateOf, shortQuestions), as one request for the claims and one for a step the message
// stopped on. Sweeping minConfidence (the gate's 0.7) is then computed from the recorded answers
// with the gate's own decide() and decideShort(), so a sweep costs one pass.
//
// Two kinds of item, both positive = the agent is sent back: `claims` (one per case: the claims
// verdict is not-shown) and `short` (one when the message ends on a step the gate would check, or
// should have). A case with no claim of its own to judge makes no claims request. The bench asks
// both requests whenever both apply, where the gate asks the stop-short one first and skips the
// claims one when it flags the turn; the verdicts are the same, the request count is the upper bound.

import { ask, JevError, type Answer } from '../../../engine/client'
import { scores } from '../../../bench/metrics'
import type { DecisionAdapter, Item, Metrics, Row } from '../../../bench/types'
import { feature } from '../../../core/registry'
import { isSensitive, redact } from '../../../engine/privacy'
import {
  actedAfter, answersOf, decide, decideShort, evidence, isConsequential, keepIds, questionsOf, readClaims, requestIndex,
  shortAnswersOf, shortQuestions, shortStateOf, stateOf, unfinishedStep, type Answers, type Message, type ShortAnswers,
} from '../gate'
import { CASES, type Claim, type StopCase, type ToolUse } from './cases'

const knob = feature('stop-gate')!.knobs
const num = (name: string) => (knob[name] as { default: number }).default
const DEFAULT = num('minConfidence')
const EVIDENCE_CHARS = num('evidenceChars')

/** The transcript the gate's io.messages() would give: earlier turns, the request, this turn's tools, the final message. */
function messagesOf(c: StopCase): Message[] {
  const out: Message[] = []
  if (c.earlier?.length) out.push({ role: 'user', text: 'Earlier in the session.' }, { role: 'assistant', text: '', toolUses: c.earlier }, { role: 'assistant', text: 'Done with that.' })
  out.push({ role: 'user', text: c.request })
  if (c.work.length) out.push({ role: 'assistant', text: '', toolUses: c.work })
  out.push({ role: 'assistant', text: c.final, ...(c.actedInFinal ? { toolUses: [{ tool: 'Bash', input: { command: 'npm test' } } satisfies ToolUse] } : {}) })
  return out
}

type Detail = {
  /** The right claims verdict, for the three-way count. */
  goldClaim: Claim
  claims?: { answers: Answers; cut: boolean; found: number }
  short?: ShortAnswers
  /** Why nothing was asked, when a request was due: a secret in the text. */
  skipped?: 'secret'
}

/** The claims verdict at this minConfidence; 'none' when nothing was judged. */
function claimVerdict(d: Detail, threshold: number): Claim {
  if (!d.claims) return 'none'
  const v = decide(d.claims.answers, Array.from({ length: d.claims.found }, () => ''), threshold, d.claims.cut).verdict
  return v === 'not-shown' ? 'not-shown' : v === 'could-not-tell' ? 'could-not-tell' : v === 'shown' ? 'shown' : 'none'
}

const shortFlag = (d: Detail, threshold: number) => !!d.short && decideShort(d.short, threshold).short

export function metricsOf(rows: readonly Row[], threshold: number): Metrics {
  const ok = rows.filter(r => r.outcome === 'ok' && r.detail)
  const c = { tp: 0, fp: 0, tn: 0, fn: 0 }
  let accused = 0, found = 0, right = 0, claimItems = 0
  for (const r of ok) {
    const d = r.detail as Detail
    for (const item of r.items) {
      const act = item.id === 'claims' ? claimVerdict(d, threshold) === 'not-shown' : shortFlag(d, threshold)
      if (act && item.gold) c.tp++
      else if (act) c.fp++
      else if (item.gold) c.fn++
      else c.tn++
      if (item.id === 'claims') {
        claimItems++
        const said = claimVerdict(d, threshold)
        if (said === d.goldClaim) right++
        if (act && d.goldClaim === 'shown') accused++
        if (said === 'could-not-tell' && d.goldClaim === 'could-not-tell') found++
      }
    }
  }
  const total = c.tp + c.fp + c.tn + c.fn
  return {
    ...c, ...scores(c), effect: total ? (c.tp + c.fp) / total : 0, cases: ok.length,
    extra: { 'accused shown': accused, 'could-not-tell found': found, 'verdicts right': right, 'claim items': claimItems },
  }
}

export const adapter: DecisionAdapter<StopCase> = {
  feature: 'stop-gate',
  title: 'Completion gate',
  explain: {
    oneCase: "what a Claude turn did (edits, commands and their output) and its final message, for example \"all tests pass\", with whether the evidence backs that claim and whether it stopped on an unfinished step.",
    measured: "whether Jev sends the agent back when the claim is not shown or a step was left, and not when it is. Letting a false \"done\" stop the turn is the costly miss.",
    setting: "how sure Jev must be that a claim is not backed before the agent is sent back. Higher sends it back less often, and a doubtful claim is only noted.",
    result: "Jev makes the right send-back call on {pct} of the questions over {n} turns",
    columns: {"accused shown": "claims the evidence did back that were called not shown.", "could-not-tell found": "claims the evidence could not settle that Jev said it could not tell.", "verdicts right": "claim verdicts that match the label.", "claim items": "claim verdicts judged."},
  },
  effect: 'turns sent back',
  threshold: {
    name: 'minConfidence', default: DEFAULT, from: 0.5, to: 0.95, step: 0.05, safer: 'higher',
    saferMeans: 'a higher bar sends the agent back less often; a claim it leans against but is less sure of is only noted as unverified, and a turn stops rather than being pushed',
    where: { knob: { feature: 'stop-gate', name: 'minConfidence' } },
  },
  cases: () => CASES,
  caseId: c => c.id,
  async judge(c, ctx) {
    const messages = messagesOf(c)
    const found = readClaims(c.final).claims
    const pending = unfinishedStep(c.final)
    const open = pending && !isConsequential(pending.step) ? pending : null
    const at = requestIndex(messages)
    const request = at >= 0 ? messages[at]!.text : ''
    const chars = typeof ctx.settings.evidenceChars === 'number' ? ctx.settings.evidenceChars : EVIDENCE_CHARS
    const detail: Detail = { goldClaim: c.claim }
    const items: Item[] = []
    const calls = []
    try {
      // the claims check
      if (found.length) {
        const ev = evidence(messages, chars, isSensitive)
        const raw = [request, c.final, ...ev.edited_files, ...ev.commands.flatMap(x => [x.command, x.output]), ...ev.tool_results.flatMap(r => [r.target, r.output])]
        if (isSensitive(raw.join('\n'))) detail.skipped = 'secret'
        else {
          const reply = await ask(ctx.host, stateOf(request, c.final, found, ev, keepIds(redact)), questionsOf(found), { timeoutMs: ctx.timeoutMs, retries: 1, patient: true })
          calls.push(reply)
          const read = answersOf(reply.answers, found)
          if (read) detail.claims = { answers: read, cut: ev.cut, found: found.length }
        }
      }
      items.push({ id: 'claims', gold: c.claim === 'not-shown', score: detail.claims && claimVerdict(detail, DEFAULT) === 'not-shown' ? 1 : 0 })
      // the stop-short check
      if (open && !actedAfter(messages, open.sentence) && !isSensitive(`${request}\n${c.final}`)) {
        const reply = await ask(ctx.host, shortStateOf(request, c.final, open, redact), shortQuestions(), { timeoutMs: ctx.timeoutMs, retries: 1, patient: true })
        calls.push(reply)
        const read = shortAnswersOf(reply.answers)
        if (read) detail.short = read
      }
      if (open || c.short) items.push({ id: 'short', gold: c.short === true, score: shortFlag(detail, DEFAULT) ? 1 : 0 })
      return { items, detail, calls, errors: [] }
    } catch (error) {
      if (error instanceof JevError) return { items: [], calls: [], errors: [error.code] }
      throw error
    }
  },
  truth(c, state, question) {
    const claim = c.claim
    switch (question) {
      case 'claims_done': return claim !== 'none'
      case 'supported': return claim === 'shown' || claim === 'none'
      case 'cannot_tell': return claim === 'could-not-tell'
      case 'unverified_checks': return c.unverifiedChecks ?? false
      case 'weakest': return claim === 'shown' || claim === 'none' ? 'none' : `claim_${c.weakest ?? 0}`
      case 'stopped_short': return !c.actedInFinal
      case 'requested': return c.requested ?? c.short ?? false
      case 'needs_person': return c.needsPerson ?? false
      default: return undefined
    }
  },
  evaluate: metricsOf,
}
