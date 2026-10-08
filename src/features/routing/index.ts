import { hostOf } from '../../core/host'
import type { IO } from '../../core/io'
import { coolingOff, OUTAGES, record } from '../../core/jev'
import { limitsOf } from '../../core/limits'
import * as memory from '../../core/memory'
import { isPrivate, jevDir, routingOn } from '../../core/settings'
import { activeBackend } from '../../engine/client'
import { LANE_POLICY_TEXT } from '../../engine/lane-policy'
import { classify as classifyLane, targets, type Target } from '../../engine/lanes'
import { parse, type Policy } from '../../engine/policy'
import { chooseModel, FOLLOW_UP_MS, sessionLane, type LaneName, type Previous } from './rules'

// Routing: the lane for each turn (small / medium / high / escalate) sets the effort of every
// step, and the model while the context is small. The lane is Jev's reading of the prompt,
// laid under the session rules (rules.ts): follow-ups step down one lane at most, corrections
// hold or raise it, and above MODEL_SWITCH_MAX_TOKENS the model only moves up.

export const MODEL_SWITCH_MAX_TOKENS = 40_000
const CLASSIFY_TIMEOUT_MS = 4_000 // per request, as `jev lane classify` had it
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
}

const prompts = new Map<string, string>()                // turnId -> the person's text
const decisions = new Map<string, Lane | null>()         // turnId -> the lane (null: as is)
const preclassified = new Map<string, LaneName | null>() // prompt text -> Jev's lane, read at submit
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

async function classify(io: IO, text: string): Promise<LaneName | null> {
  if (!text.trim() || text.trimStart().startsWith('/') || coolingOff() || !routingOn(io)) return null
  if (await isPrivate(io, await jevDir(io))) return null
  const { policy, tables } = await loadConfig(io)
  if (!policy) return null
  const out = await classifyLane(hostOf(io), text, policy, { tables, timeoutMs: CLASSIFY_TIMEOUT_MS, limits: await limitsOf(io) })
  const decision = out.decision
  if (decision.sent_to_jev) {
    await record(io, { calls: 1, cost: decision.cost_usd, model: decision.jev_model,
      error: decision.error && OUTAGES.includes(decision.error) ? decision.error : null })
  }
  if (!out.target || out.lane === 'keep_current') return null
  return out.lane as LaneName
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

async function decide(io: IO, text: string, mine: RoutingSpace): Promise<Lane | null> {
  if (!routingOn(io)) return null
  const now = Date.now()
  const previous = mine.previous ?? null
  const recent = previous !== null && now - previous.at <= FOLLOW_UP_MS
  if (!text.trim()) return recent && previous ? { lane: previous.lane, ...(await lanes(io))[previous.lane] } : null
  const classified = preclassified.has(text) ? (preclassified.get(text) ?? null) : await classify(io, text)
  const ruled = sessionLane(classified, previous, text, now)
  if (ruled.lane === null) return null
  mine.previous = { lane: ruled.lane, at: now, corrections: ruled.corrections }
  return { lane: ruled.lane, ...(await lanes(io))[ruled.lane] }
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
  const lane = decisions.get(e.turnId) ?? null
  if (!lane) {
    io.status('jev: as is')
    Object.assign(mine, { lastModel: e.model, lane: 'as is', changed: false, effort: e.effort === undefined ? undefined : String(e.effort) })
    if (first) await memory.save(io)
    return null
  }
  const wanted = lane.model ? (MODEL_IDS[lane.model] ?? lane.model) : undefined
  const { contextTokens } = await io.usage()
  const model = chooseModel(wanted, mine.lastModel ?? e.model, contextTokens, MODEL_SWITCH_MAX_TOKENS)
  const effort = NO_EFFORT.test(model) ? undefined : (lane.effort ?? e.effort)
  const changed = model !== e.model || String(effort ?? '') !== String(e.effort ?? '')
  Object.assign(mine, { lastModel: model, lane: lane.lane, changed, effort: effort === undefined ? undefined : String(effort) })
  if (first) await memory.save(io)
  io.status(`jev: ${lane.lane} · ${model.replace('claude-', '')}${effort ? ' · ' + effort : ''}`)
  return { model, effort }
}
