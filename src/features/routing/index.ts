import { hostOf } from '../../core/host'
import * as activity from '../../core/activity'
import type { IO } from '../../core/io'
import { coolingOff, failureOf, record } from '../../core/jev'
import { limitsOf } from '../../core/limits'
import * as memory from '../../core/memory'
import { modeOf } from '../../core/config'
import { isPrivate, jevDir } from '../../core/settings'
import { activeBackend } from '../../engine/client'
import { LANE_POLICY_TEXT } from '../../engine/lane-policy'
import { classify as classifyLane, targets, type Target } from '../../engine/lanes'
import { parse, versionOf, type Facts, type Policy } from '../../engine/policy'
import { chooseModel, FOLLOW_UP_MS, isCorrection, sessionLane, type LaneName, type Previous } from './rules'

// Routing: the lane for each turn (small / medium / high / escalate) sets the effort of every
// step, and the model while the context is small. The lane is Jev's reading of the prompt,
// laid under the session rules (rules.ts): follow-ups step down one lane at most, corrections
// hold or raise it, and above MODEL_SWITCH_MAX_TOKENS the model only moves up.
//
// The lane policy's pre-rules read two facts the mod supplies. `person_named_model`: the person
// chose the session's model with /model, the model picker or an SDK/IDE set_model (Claude Code's
// PostModelSwitch; the mod's own rewrites of a step never switch the session's model), so the
// turn runs on it and Jev is not asked, until they choose "default" again. A model set at launch
// (--model, settings.json) is not seen as a choice. `prior_failed_attempts`: the corrections in a
// row this prompt makes (rules.ts). The policy's third fact, `security_paths`, needs a path check
// over the work that a prompt does not give, so the mod never supplies it.

export const MODEL_SWITCH_MAX_TOKENS = 40_000
const CLASSIFY_TIMEOUT_MS = 4_000 // in all, its retries included, as `jev lane classify` had it
const CONFIG_TTL_MS = 5 * 60_000

// The lane table names models as Claude Code's agent files do; a full id passes through.
const MODEL_IDS: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
}
const NO_EFFORT = /haiku/

type Lane = { lane: string; model?: string; effort?: string }
type Table = Record<string, Target>
export type RoutingSpace = {
  previous?: Previous | null; lastModel?: string; lane?: string; effort?: string
  changed?: boolean // the mod changed this turn's model or effort from what Claude Code sent
  why?: string // why the last turn was not routed, when the band should say: the person's /model, a drift
  personModel?: string // the model the person chose for this session (/model, the picker), held until "default"
  drift?: string // the last answer came from a Jev the policy was not tuned on ("Jev 1.14 ≠ tuned 1.13")
  untuned?: string // the named backend that answered a policy not tuned for it (routed anyway)
}

/** What a turn's first step decided: a lane, or none and what to count it as (nothing when routing is off). */
type Outcome = { lane: Lane } | { lane: null; count: 'kept' | 'unavailable' | null; why?: string }

const prompts = new Map<string, string>()                // turnId -> the person's text
const decisions = new Map<string, Outcome>()             // turnId -> the lane, or why none
const changedTurns = new Map<string, boolean>()          // turnId -> whether any step of it was changed
const preclassified = new Map<string, Classified>()      // prompt text -> what Jev answered, read at submit
let config: { at: number; policy: Policy | null; tables: unknown[] } | null = null

function remember<V>(map: Map<string, V>, key: string, value: V): void {
  map.set(key, value)
  if (map.size > 50) map.delete(map.keys().next().value as string)
}

async function readJson(io: IO, path: string): Promise<unknown> {
  try { return JSON.parse(await io.readFile(path)) } catch { return undefined }
}

/**
 * The lane policy and the lanes.json tables, where jev-skills looks for them: the active
 * backend's own copy of the policy, else a local override, else the one jev-skills ships; the
 * XDG lanes.json, then the shared one. An override that does not lint is not used, and nothing
 * is routed (as the `jev` command refused it). Read again after five minutes.
 */
async function loadConfig(io: IO): Promise<{ policy: Policy | null; tables: unknown[] }> {
  if (config && Date.now() - config.at < CONFIG_TTL_MS) return config
  const host = hostOf(io)
  const dir = await jevDir(io)
  let backend = null
  try { backend = await activeBackend(host) } catch { backend = null }
  let policy: Policy | null = null
  const places: [string, string][] = [...(backend ? [[`${dir}/backends/${backend.name}/policies/lane.json`, 'backend'] as [string, string]] : []),
    [`${dir}/policies/lane.json`, 'override']]
  let found = false
  for (const [path, origin] of places) {
    const text = await host.readFile(path)
    if (text === undefined) continue
    found = true
    try { policy = parse(text, 'lane', origin) } catch { policy = null }
    break
  }
  if (!found) policy = parse(LANE_POLICY_TEXT, 'lane', 'shipped')
  const xdg = `${(await io.env('XDG_CONFIG_HOME')) || `${(await io.home()) ?? ''}/.config`}/jev/lanes.json`
  const files = [...new Set([xdg, `${dir}/lanes.json`])]
  const tables = (await Promise.all(files.map(path => readJson(io, path)))).filter(t => t !== undefined)
  config = { at: Date.now(), policy, tables }
  return config
}

// What classify read: `none` when Jev gave no answer at all (an error, the cool-off, private mode,
// no policy, a fallback; `why` says so when it was a drift); { lane: null } when it did answer,
// but with no lane (keep_current), `held` when a pre-rule kept the person's model.
type Classified = { lane: LaneName | null; held?: boolean } | { lane: null; none: true; why?: string }

const NO_ANSWER: Classified = { lane: null, none: true }

/** "typesafe/jev-1.14-20261001" -> "1.14"; the text as it is when it names no version. */
function shortVersion(model: string | null | undefined): string {
  const parts = versionOf(model)
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts.length ? String(parts[0]) : String(model ?? '?')
}

/** The pre-rules' facts for this prompt, from the session's record. */
export function factsOf(mine: RoutingSpace, text: string, now: number): Facts {
  const previous = mine.previous ?? null
  const recent = previous !== null && now - previous.at <= FOLLOW_UP_MS
  return {
    person_named_model: !!mine.personModel,
    prior_failed_attempts: recent && previous && isCorrection(text) ? previous.corrections + 1 : 0,
  }
}

async function classify(io: IO, text: string): Promise<Classified> {
  if (!text.trim() || text.trimStart().startsWith('/') || coolingOff() || await modeOf(io, 'routing') === 'off') return NO_ANSWER
  if (await isPrivate(io, await jevDir(io))) return NO_ANSWER
  const { policy, tables } = await loadConfig(io)
  if (!policy) return NO_ANSWER
  const mine = memory.space<RoutingSpace>('routing')
  const out = await classifyLane(hostOf(io), text, policy,
    { tables, timeoutMs: CLASSIFY_TIMEOUT_MS, limits: await limitsOf(io), facts: factsOf(mine, text, Date.now()) })
  const decision = out.decision
  if (decision.sent_to_jev) {
    // What answered, for the band and /jev-mod status: a Jev the policy was not tuned on, a backend it was not tuned for.
    if (decision.error === 'drift') mine.drift = `Jev ${shortVersion(decision.jev_model)} ≠ tuned ${shortVersion(policy.tuned_on)}`
    else if (decision.status === 'ok') delete mine.drift
    if (decision.untuned && decision.provider) mine.untuned = decision.provider
    else if (decision.status === 'ok') delete mine.untuned
    await record(io, { calls: 1, cost: decision.cost_usd, model: decision.jev_model, error: failureOf(decision.error) }, 'routing')
  }
  if (decision.fallback_used) return decision.error === 'drift' ? { ...NO_ANSWER, why: mine.drift } : NO_ANSWER
  if (decision.source === 'code' && out.lane === 'keep_current') return { lane: null, held: true }
  if (!out.target || out.lane === 'keep_current') return { lane: null }
  return { lane: out.lane as LaneName }
}

async function lanes(io: IO): Promise<Table> {
  return targets((await loadConfig(io)).tables)
}

/** At submit, beside the other features' analysis: Jev's lane for the prompt. */
export async function analyse(io: IO, text: string): Promise<void> {
  remember(preclassified, text, await classify(io, text))
}

export function turnStarted(turnId: string, text: string): void {
  remember(prompts, turnId, text)
}

/** The person's choice of the session's model (Claude Code's PostModelSwitch); "default" hands it back to routing. */
export async function modelChosen(io: IO, e: { source: string; requested_model: string | null; to_model: string }): Promise<void> {
  // auto: a fallback Claude Code made; resume: whatever the session's record already says.
  if (!['command', 'picker', 'sdk'].includes(e.source)) return
  const mine = memory.space<RoutingSpace>('routing')
  if (e.requested_model === null) delete mine.personModel
  else mine.personModel = e.to_model
  await memory.save(io)
}

async function decide(io: IO, text: string, mine: RoutingSpace): Promise<Outcome> {
  if (await modeOf(io, 'routing') === 'off') return { lane: null, count: null }
  const now = Date.now()
  const previous = mine.previous ?? null
  const recent = previous !== null && now - previous.at <= FOLLOW_UP_MS
  // The person's /model holds, follow-ups included: the lane policy's pre-rule keeps it without
  // asking Jev (an override without that pre-rule is asked as usual).
  const held: Outcome = { lane: null, count: 'kept', ...(mine.personModel ? { why: 'your /model' } : {}) }
  if (!text.trim()) {
    if (mine.personModel) return held
    return recent && previous ? { lane: { lane: previous.lane, ...(await lanes(io))[previous.lane] } } : { lane: null, count: 'kept' }
  }
  const classified = preclassified.has(text) ? preclassified.get(text)! : await classify(io, text)
  if ('held' in classified && classified.held) return held
  if (mine.personModel && 'none' in classified) return held
  // No answer from Jev is not a follow-up: the turn runs as is and the session's lane stays.
  if ('none' in classified) return { lane: null, count: 'unavailable', ...(classified.why ? { why: classified.why } : {}) }
  const ruled = sessionLane(classified.lane, previous, text, now)
  if (ruled.lane === null) return { lane: null, count: 'kept' }
  mine.previous = { lane: ruled.lane, at: now, corrections: ruled.corrections }
  return { lane: { lane: ruled.lane, ...(await lanes(io))[ruled.lane] } }
}

/**
 * The model and effort for one step of the main thread, or null to send it as Claude Code
 * would. The lane is decided once per turn, on its first step.
 */
export async function step(
  io: IO, e: { turnId: string; model: string; effort?: unknown },
): Promise<{ model: string; effort: unknown } | null> {
  const mine = memory.space<RoutingSpace>('routing')
  const first = !decisions.has(e.turnId)
  if (first) remember(decisions, e.turnId, await decide(io, prompts.get(e.turnId) ?? '', mine))
  const outcome = decisions.get(e.turnId) ?? { lane: null, count: null }
  if (!outcome.lane) {
    // Routing off: nothing recorded, nothing counted; the turn is simply Claude Code's.
    if (outcome.count === null) return null
    Object.assign(mine, { lastModel: e.model, lane: 'as is', changed: false, why: outcome.why,
      effort: e.effort === undefined ? undefined : String(e.effort) })
    if (first) await Promise.all([memory.save(io), activity.count(io, 'routing', outcome.count)])
    return null
  }
  const lane = outcome.lane
  const wanted = lane.model ? (MODEL_IDS[lane.model] ?? lane.model) : undefined
  const { contextTokens } = await io.usage()
  const model = chooseModel(wanted, mine.lastModel ?? e.model, contextTokens, MODEL_SWITCH_MAX_TOKENS)
  const effort = NO_EFFORT.test(model) ? undefined : (lane.effort ?? e.effort)
  // Per turn, not per step: a turn's later steps can arrive already on the model an earlier
  // step was routed to, and the band would then read "kept" for a turn the mod did route.
  const changed = (changedTurns.get(e.turnId) ?? false) || model !== e.model || String(effort ?? '') !== String(e.effort ?? '')
  remember(changedTurns, e.turnId, changed)
  Object.assign(mine, { lastModel: model, lane: lane.lane, changed, why: undefined, effort: effort === undefined ? undefined : String(effort) })
  // What it did: the lane that changed the turn, or "kept" when the turn runs as it came.
  if (first) await Promise.all([memory.save(io), activity.count(io, 'routing', changed ? lane.lane : 'kept')])
  return { model, effort }
}
