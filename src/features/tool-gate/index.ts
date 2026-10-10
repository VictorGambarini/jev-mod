import { hostOf } from '../../core/host'
import * as activity from '../../core/activity'
import { inBackground } from '../../core/background'
import type { IO } from '../../core/io'
import { coolingOff, recordCalls } from '../../core/jev'
import { limitsOf } from '../../core/limits'
import * as memory from '../../core/memory'
import { modeOf, setting } from '../../core/config'
import { isPrivate, jevDir } from '../../core/settings'
import { ask, costOf, JevError } from '../../engine/client'
import { callIsSensitive, decide, questionsFor, remember as rememberPrompt, riskOf, stateOf, type Remembered, type Risk, type Scope, type Verdict } from './rules'

// The tool-call gate: before a consequential call runs (a push, a delete, a publish, a deploy,
// a write outside the project, an MCP tool that sends or changes something), the decision model
// is asked whether the person asked for it, whether it breaks a limit they stated, and whether
// it is hard to undo. A doubtful call is put to the person (the permission dialog, with the
// reason) instead of running unasked.
//
// It sits on `tool.check`, the engine's permission decision, and only ever tightens it: a call
// Claude Code would refuse or already put to the person is left alone, and one it would allow
// becomes an ask, never a deny. A risky call that carries a secret is never sent: it is put to the
// person locally instead, since a credential riding on a push or a POST is exactly what the gate
// is for. Every other failure (no answer in time, private mode, the budget, the cool-off) leaves
// Claude Code's own verdict standing.

export const ID = 'tool-gate'

export type ToolGateSpace = Remembered & { asked?: number; last?: string }

/** At submit: the prompt, redacted, and the limits it states, for the calls that follow. */
export async function analyse(io: IO, text: string): Promise<void> {
  if (await modeOf(io, ID) === 'off') return
  const mine = memory.space<ToolGateSpace>(ID)
  Object.assign(mine, rememberPrompt(mine, text))
  await memory.save(io)
}

export type Gate = { decision: 'ask'; reason: string } | null

/** The reason the person reads when a risky call carries a secret and so was not judged. */
export function secretReason(why: string): string {
  return `jev-mod tool gate: this ${why} and carries a credential, so it was not sent to the decision model; check it yourself`
}

type Call = { tool: string; input: unknown; agentId?: string }

/**
 * What the gate makes of one call Claude Code would allow: an ask with the reason the person
 * reads, or null to leave the verdict as it is. Counts what it did (or in shadow would have
 * done) for the calls it looked at; calls it does not consider risky are not counted. A risky
 * call carrying a secret is never sent: on, it is put to the person with secretReason; shadow
 * counts would-ask-secret. Off, or a
 * call that is not risky, costs one read of the config and nothing else. In shadow the
 * judgement runs in the background: nothing changes, so the call never waits for it.
 */
export async function check(io: IO, e: Call): Promise<Gate> {
  const resolved = await setting(io, ID)
  if (resolved.mode === 'off') return null
  const scope = String(resolved.knobs.scope?.value ?? 'all-risky') as Scope
  const [root, home] = await Promise.all([io.projectRoot(), io.home()])
  const risk = riskOf(e.tool, e.input, scope, root, home)
  if (!risk) return null
  await memory.load(io)
  if (callIsSensitive(e.tool, e.input)) {
    // Never sent, whatever the mode; judged by the person instead. Shadow only counts it.
    if (resolved.mode !== 'on') { await activity.count(io, ID, 'would-ask-secret'); return null }
    await noteAsk(io, risk.why, 'asked-secret')
    return { decision: 'ask', reason: secretReason(risk.why) }
  }
  const minConfidence = Number(resolved.knobs.minConfidence?.value ?? 0.7)
  const timeoutMs = Number(resolved.knobs.timeoutMs?.value ?? 2000)
  if (resolved.mode !== 'on') {
    inBackground(() => judge(io, e, risk, minConfidence, timeoutMs, true))
    return null
  }
  const verdict = await judge(io, e, risk, minConfidence, timeoutMs, false)
  if (!verdict) return null
  await noteAsk(io, risk.why, 'asked-person')
  return { decision: 'ask', reason: verdict.reason }
}

async function noteAsk(io: IO, why: string, outcome: string): Promise<void> {
  const mine = memory.space<ToolGateSpace>(ID)
  mine.asked = (mine.asked ?? 0) + 1
  mine.last = why
  await Promise.all([memory.save(io), activity.count(io, ID, outcome)])
}

/** The decision model's verdict on a risky call when it doubts it, else null; every outcome but the ask counted here. */
async function judge(io: IO, e: Call, risk: Risk, minConfidence: number, timeoutMs: number, shadow: boolean): Promise<Verdict | null> {
  const skip = async (): Promise<null> => { await activity.count(io, ID, 'skipped'); return null }
  const mine = memory.space<ToolGateSpace>(ID)
  if (!mine.prompts?.length) return skip() // nothing to judge it against
  if (coolingOff()) return skip()
  const dir = await jevDir(io)
  if (await isPrivate(io, dir)) return skip()
  const limits = await limitsOf(io)
  if (limits) {
    const [allowed] = await limits.admit(shadow)
    if (!allowed) return skip()
  }

  let answers
  try {
    const asked = await ask(hostOf(io), stateOf(e.tool, e.input, risk, mine, !!e.agentId), questionsFor(mine), { timeoutMs, retries: 0 })
    await Promise.all([recordCalls(io, [asked], [], ID), limits?.charge(costOf(asked))])
    answers = asked.answers
  } catch (error) {
    await recordCalls(io, [], [error instanceof JevError ? error.code : 'network'], ID)
    return skip()
  }

  const verdict = decide(answers, risk, mine, minConfidence)
  if (!verdict.ask) {
    await activity.count(io, ID, 'passed')
    return null
  }
  if (shadow) {
    await activity.count(io, ID, 'would-ask')
    return null
  }
  return verdict
}
