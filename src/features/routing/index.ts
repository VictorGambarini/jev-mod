import type { IO } from '../../core/io'
import { jev } from '../../core/jev'
import * as memory from '../../core/memory'
import { chooseModel, FOLLOW_UP_MS, sessionLane, type LaneName, type Previous } from './rules'

// Routing: the lane for each turn (small / medium / high / escalate) sets the effort of every
// step, and the model while the context is small. The lane is Jev's reading of the prompt,
// laid under the session rules (rules.ts): follow-ups step down one lane at most, corrections
// hold or raise it, and above MODEL_SWITCH_MAX_TOKENS the model only moves up.

export const MODEL_SWITCH_MAX_TOKENS = 40_000
const CLASSIFY_TIMEOUT_MS = 6_000

// The lane table names models as Claude Code's agent files do; a full id passes through.
const MODEL_IDS: Record<string, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
}
const NO_EFFORT = /haiku/

type Lane = { lane: string; model?: string; effort?: string }
type Table = Record<string, { model?: string; effort?: string }>
export type RoutingSpace = { previous?: Previous | null; lastModel?: string; lane?: string; effort?: string }

const prompts = new Map<string, string>()                // turnId -> the person's text
const decisions = new Map<string, Lane | null>()         // turnId -> the lane (null: as is)
const preclassified = new Map<string, LaneName | null>() // prompt text -> Jev's lane, read at submit
let table: Table | null = null

function remember<V>(map: Map<string, V>, key: string, value: V): void {
  map.set(key, value)
  if (map.size > 50) map.delete(map.keys().next().value as string)
}

async function classify(io: IO, text: string): Promise<LaneName | null> {
  if (!text.trim() || text.trimStart().startsWith('/')) return null
  const out = await jev(io, ['lane', 'classify', '--task', '-', '--host', 'claude-code'], text, CLASSIFY_TIMEOUT_MS)
  if (!out || !out.target || out.lane === 'keep_current') return null
  return out.lane as LaneName
}

async function lanes(io: IO): Promise<Table> {
  if (table === null) {
    const out = await jev(io, ['lane', 'targets', '--host', 'claude-code'], '', CLASSIFY_TIMEOUT_MS)
    if (out?.lanes) table = out.lanes
  }
  return table ?? {}
}

/** At submit, beside the other features' analysis: Jev's lane for the prompt. */
export async function analyse(io: IO, text: string): Promise<void> {
  remember(preclassified, text, await classify(io, text))
}

export function turnStarted(turnId: string, text: string): void {
  remember(prompts, turnId, text)
}

async function decide(io: IO, text: string, mine: RoutingSpace): Promise<Lane | null> {
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
    Object.assign(mine, { lastModel: e.model, lane: 'as is', effort: e.effort === undefined ? undefined : String(e.effort) })
    if (first) await memory.save(io)
    return null
  }
  const wanted = lane.model ? (MODEL_IDS[lane.model] ?? lane.model) : undefined
  const { contextTokens } = await io.usage()
  const model = chooseModel(wanted, mine.lastModel ?? e.model, contextTokens, MODEL_SWITCH_MAX_TOKENS)
  const effort = NO_EFFORT.test(model) ? undefined : (lane.effort ?? e.effort)
  Object.assign(mine, { lastModel: model, lane: lane.lane, effort: effort === undefined ? undefined : String(effort) })
  if (first) await memory.save(io)
  io.status(`jev: ${lane.lane} · ${model.replace('claude-', '')}${effort ? ' · ' + effort : ''}`)
  return { model, effort }
}
