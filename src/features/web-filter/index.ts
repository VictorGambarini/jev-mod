import * as activity from '../../core/activity'
import { inBackground } from '../../core/background'
import { setting } from '../../core/config'
import { hostOf } from '../../core/host'
import type { IO } from '../../core/io'
import { coolingOff, recordCalls } from '../../core/jev'
import { limitsOf } from '../../core/limits'
import * as memory from '../../core/memory'
import { isPrivate, jevDir } from '../../core/settings'
import { ask, costOf, JevError, type Question } from '../../engine/client'
import { isSensitive } from '../../engine/privacy'
import {
  chunksOf, droppedUnits, fetchNote, fetchRequest, hitChars, hitsOf, isNamed, mustKeep, namedHosts, searchNote,
  searchRequest, termsOf, triage, unhelpful, unitsOf, withoutHits, withoutUnits,
} from './filter'

// The web filter: what WebSearch and a long WebFetch return is cut down to what the question
// needs before the model reads it (the rules are in filter.ts). It runs after screening, on the
// screened result, so it never puts unscreened text in front of the model.
//
// It fails open: off, private, a backend cooling off or failing, no key, the daily budget, a
// query or request that looks like it holds a secret: the result passes exactly as it came. A
// result on a host the person named in their request is never cut. In shadow the judgement runs
// in the background and only its would-drop counts are kept, so nothing waits for it.
//
// Subagents: their own task prompt is not seen here, so a subagent's search or fetch is judged
// against its query or fetch prompt alone; the person's request is not sent for it.

export type WebFilterSpace = { results?: number; chunks?: number; chars?: number; would?: number }

const ID = 'web-filter'

/** The person's latest request. */
let goal = ''

/** A turn began with this prompt; an empty one (a continuation) keeps the goal it had. */
export function noteGoal(text: string): void {
  if (text.trim()) goal = text
}

/** Whether a tool's results are filtered at all. */
export function wants(tool: string): boolean {
  return tool === 'WebSearch' || tool === 'WebFetch'
}

/** What the hook knows of the call: the tool's input, and whether a subagent made it. */
export type Call = { tool: string; query?: string; url?: string; prompt?: string; subagent: boolean }

type Plan = { value: unknown; results: number; chunks: number; chars: number }

/** One request; the noul answers by question name, or null when it could not be asked or failed. */
async function askOnce(io: IO, state: unknown, questions: Record<string, Question>, timeoutMs: number, shadow: boolean):
  Promise<Map<string, number> | null> {
  const limits = await limitsOf(io)
  if (limits && !(await limits.admit(shadow))[0]) return null
  try {
    const reply = await ask(hostOf(io), state, questions, { timeoutMs, retries: 0 })
    await Promise.all([recordCalls(io, [reply], [], ID), limits?.charge(costOf(reply))])
    const out = new Map<string, number>()
    for (const [name, answer] of Object.entries(reply.answers)) if (answer.type === 'noul') out.set(name, answer.noul)
    return out
  } catch (error) {
    if (!(error instanceof JevError)) throw error
    await recordCalls(io, [], [error.code], ID)
    return null
  }
}

/** The search's plan: the results with the dropped ones out and the note at the end, or null to leave them. */
async function planSearch(io: IO, call: Call, results: unknown[], knobs: Knobs, request: string, named: string[], shadow: boolean): Promise<Plan | 'skipped' | null> {
  const hits = hitsOf(results)
  const { duplicates, ask: judge } = triage(hits, knobs.keepTop, named)
  let judged = new Set<number>()
  if (judge.length) {
    const { state, questions } = searchRequest(call.query ?? '', request, hits, judge)
    const answers = await askOnce(io, state, questions, knobs.timeoutMs, shadow)
    if (answers === null) return 'skipped'
    const helps = new Map<number, number>()
    for (const [name, p] of answers) helps.set(Number(name.slice(1)), p)
    judged = unhelpful(helps, knobs.minConfidence)
  }
  const drop = new Set([...duplicates, ...judged])
  if (!drop.size) return null
  const chars = [...drop].reduce((sum, i) => sum + hitChars(hits[i]!), 0)
  const value = withoutHits(results, hits, drop, searchNote(drop.size, hits.length, duplicates.size, judged.size))
  return { value, results: drop.size, chunks: 0, chars }
}

/** The fetch's plan: the text with the parts the question does not need cut, or null to leave it. */
async function planFetch(io: IO, call: Call, text: string, knobs: Knobs, request: string, person: string, shadow: boolean): Promise<Plan | 'skipped' | null> {
  const units = unitsOf(text)
  const chunks = chunksOf(text, units)
  // local: the person's request names headings and numbers even when it is not sent
  const terms = termsOf(`${call.prompt ?? ''}\n${person}`)
  const judge = chunks.flatMap((c, id) => (mustKeep(c.text, id, terms) === null && !isSensitive(c.text) ? [id] : []))
  if (!judge.length) return null
  const { state, questions, asked } = fetchRequest(call.prompt ?? '', request, call.url ?? '', chunks, judge)
  if (!asked.length) return null
  const answers = await askOnce(io, state, questions, knobs.timeoutMs, shadow)
  if (answers === null) return 'skipped'
  const dropped = new Set<number>()
  for (const [name, p] of answers) if (1 - p >= knobs.minConfidence - 1e-9) dropped.add(Number(name.slice(1)))
  const cutUnits = droppedUnits(chunks, dropped)
  if (!cutUnits.size) return null
  const cut = withoutUnits(text, units, cutUnits)
  const draft = cut.text.replace(/\s+$/, '')
  const saved = text.length - draft.length
  const value = draft + fetchNote(saved, text.length, cut.cuts)
  if (value.length >= text.length) return null
  return { value, results: 0, chunks: dropped.size, chars: text.length - value.length }
}

type Knobs = { minConfidence: number; keepTop: number; fetchMinChars: number; timeoutMs: number }

function count(io: IO, shadow: boolean, plan: Plan | 'skipped' | null): void {
  if (plan === 'skipped') { void activity.count(io, ID, 'skipped'); return }
  if (!plan) { void activity.count(io, ID, 'kept'); return }
  const space = memory.space<WebFilterSpace>(ID)
  if (shadow) {
    if (plan.results) void activity.count(io, ID, 'would-drop-results', plan.results)
    if (plan.chunks) void activity.count(io, ID, 'would-drop-chunks', plan.chunks)
    void activity.count(io, ID, 'would-save-chars', plan.chars)
    space.would = (space.would ?? 0) + plan.results + plan.chunks
  } else {
    if (plan.results) void activity.count(io, ID, 'results-dropped', plan.results)
    if (plan.chunks) void activity.count(io, ID, 'chunks-dropped', plan.chunks)
    void activity.count(io, ID, 'chars-saved', plan.chars)
    space.results = (space.results ?? 0) + plan.results
    space.chunks = (space.chunks ?? 0) + plan.chunks
    space.chars = (space.chars ?? 0) + plan.chars
  }
  void memory.save(io)
}

/**
 * The WebSearch or WebFetch result with what the question does not need taken out, or null to
 * leave it exactly as it came: off, shadow, short, nothing to drop, or anything failing.
 */
export async function filter(io: IO, call: Call, result: unknown): Promise<unknown | null> {
  try {
    const mine = await setting(io, ID)
    if (mine.mode === 'off') return null
    await memory.load(io)
    const shadow = mine.mode !== 'on'
    const knobs: Knobs = {
      minConfidence: Number(mine.knobs.minConfidence?.value ?? 0.8),
      keepTop: Number(mine.knobs.keepTop?.value ?? 3),
      fetchMinChars: Number(mine.knobs.fetchMinChars?.value ?? 4000),
      timeoutMs: Number(mine.knobs.timeoutMs?.value ?? 3000),
    }
    const record = result as Record<string, unknown> | null
    if (!record || typeof record !== 'object') return null
    const person = goal
    const named = namedHosts(person)
    let plan: () => Promise<Plan | 'skipped' | null>
    let put: (value: unknown) => unknown
    if (call.tool === 'WebSearch') {
      const results = record.results
      if (!Array.isArray(results) || isSensitive(call.query ?? '')) return null
      plan = () => planSearch(io, call, results, knobs, call.subagent ? '' : person, named, shadow)
      put = value => ({ ...record, results: value })
    } else if (call.tool === 'WebFetch') {
      const text = record.result
      if (typeof text !== 'string' || text.length < knobs.fetchMinChars) return null
      if (isNamed(call.url ?? '', named)) { void activity.count(io, ID, 'named-host'); return null }
      if (isSensitive(call.prompt ?? '')) return null
      plan = () => planFetch(io, call, text, knobs, call.subagent ? '' : person, person, shadow)
      put = value => ({ ...record, result: value })
    } else return null
    // a request that looks like it holds a secret is not sent at all
    if (coolingOff() || (!call.subagent && isSensitive(person)) || (await isPrivate(io, await jevDir(io)))) return null
    if (shadow) {
      inBackground(async () => count(io, true, await plan()))
      return null
    }
    const done = await plan()
    count(io, false, done)
    return done && done !== 'skipped' ? put(done.value) : null
  } catch {
    return null
  }
}
