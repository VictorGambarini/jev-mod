import { hostOf } from '../../core/host'
import * as activity from '../../core/activity'
import type { IO } from '../../core/io'
import { coolingOff, recordCalls } from '../../core/jev'
import { limitsOf } from '../../core/limits'
import * as memory from '../../core/memory'
import { modeOf, setting } from '../../core/config'
import { isPrivate, jevDir } from '../../core/settings'
import { ask, costOf, JevError } from '../../engine/client'
import { callIsSensitive, decide, questionsFor, remember as rememberPrompt, riskOf, stateOf, type Remembered, type Scope } from './rules'

// The tool-call gate: before a consequential call runs (a push, a delete, a publish, a deploy,
// a write outside the project, an MCP tool that sends or changes something), the decision model
// is asked whether the person asked for it, whether it breaks a limit they stated, and whether
// it is hard to undo. A doubtful call is put to the person (the permission dialog, with the
// reason) instead of running unasked.
//
// It sits on `tool.check`, the engine's permission decision, and only ever tightens it: a call
// Claude Code would refuse or already put to the person is left alone, and one it would allow
// becomes an ask, never a deny. Every failure (no answer in time, private mode, a secret in the
// call, the budget, the cool-off) leaves Claude Code's own verdict standing.

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

/**
 * What the gate makes of one call Claude Code would allow: an ask with the reason the person
 * reads, or null to leave the verdict as it is. Counts what it did (or in shadow would have
 * done) for the calls it looked at; calls it does not consider risky are not counted.
 */
export async function check(io: IO, e: { tool: string; input: unknown; agentId?: string }): Promise<Gate> {
  const resolved = await setting(io, ID)
  if (resolved.mode === 'off') return null
  const scope = String(resolved.knobs.scope?.value ?? 'all-risky') as Scope
  const minConfidence = Number(resolved.knobs.minConfidence?.value ?? 0.7)
  const timeoutMs = Number(resolved.knobs.timeoutMs?.value ?? 2000)
  const [root, home] = await Promise.all([io.projectRoot(), io.home()])
  const risk = riskOf(e.tool, e.input, scope, root, home)
  if (!risk) return null
  const shadow = resolved.mode !== 'on'
  const skip = async (): Promise<Gate> => { await activity.count(io, ID, 'skipped'); return null }

  const mine = memory.space<ToolGateSpace>(ID)
  if (!mine.prompts?.length) return skip() // nothing to judge it against
  if (coolingOff() || callIsSensitive(e.tool, e.input)) return skip()
  const dir = await jevDir(io)
  if (await isPrivate(io, dir)) return skip()
  const limits = await limitsOf(io)
  if (limits) {
    const [allowed] = await limits.admit(shadow)
    if (!allowed) return skip()
  }

  const host = hostOf(io)
  let answers
  try {
    const asked = await ask(host, stateOf(e.tool, e.input, risk, mine, !!e.agentId), questionsFor(mine), { timeoutMs, retries: 0 })
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
  mine.asked = (mine.asked ?? 0) + 1
  mine.last = risk.why
  await Promise.all([memory.save(io), activity.count(io, ID, 'asked-person')])
  return { decision: 'ask', reason: verdict.reason }
}
