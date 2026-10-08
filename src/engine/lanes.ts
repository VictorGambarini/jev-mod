// Lanes: the smallest model and lowest effort that should still get a piece of work right.
//
// Ported from jev-skills' jevkit/lanes.py (classify, targets), the decide.decide that runs its
// policy, and limits.py's budget arithmetic. Four lanes, small < medium < high < escalate, each
// a model and effort for the host; the decision model reads the work, the lane policy's rules
// (code) turn its readings into the lane. `step` and `evidence` are for loops that delegate
// work and check it; the mod routes turns and has no use for them.

import { ask, costOf, JevError, USD_PER_INPUT_TOKEN, type Host } from './client'
import { apply, DEFAULT_BAND, drifted, preDecide, readings, untuned, type Facts, type Policy } from './policy'
import { isSensitive, redact } from './privacy'
import { encode } from './pyjson'
import { pyRound } from './pyre'

export const LANES = ['small', 'medium', 'high', 'escalate'] as const
export type Target = Record<string, string>

// The Claude Code subagents jev-skills' installer writes (jev-lane-*.md) carry the same model
// and effort in their frontmatter, so a lane is also the agent to delegate it to.
export const CLAUDE_CODE_TARGETS: Record<string, Target> = {
  small: { agent: 'jev-lane-small', model: 'haiku', effort: 'low' },
  medium: { agent: 'jev-lane-medium', model: 'sonnet', effort: 'medium' },
  high: { agent: 'jev-lane-high', model: 'opus', effort: 'medium' },
  escalate: { agent: 'jev-lane-escalate', model: 'opus', effort: 'high' },
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
/** The fields a policy reads: `state_fields`, or every field when it names none (Python's `wanted or state`). */
const fieldsOf = (policy: Policy, state: Record<string, unknown>) => (policy.state_fields?.length ? policy.state_fields : Object.keys(state))

/**
 * Claude Code's lane -> model/effort table with each lanes.json laid on top, least specific
 * first (`{"claude-code": {"small": {"model": "sonnet"}}}`): a lane or field a file does not
 * name keeps the default, and only text and numbers are taken, as text.
 */
export function targets(tables: unknown[]): Record<string, Target> {
  const out: Record<string, Target> = Object.fromEntries(Object.entries(CLAUDE_CODE_TARGETS).map(([lane, spec]) => [lane, { ...spec }]))
  for (const table of tables) {
    if (!isObject(table) || !isObject(table['claude-code'])) continue
    for (const [lane, spec] of Object.entries(table['claude-code'])) {
      if (!(lane in out) || !isObject(spec)) continue
      for (const [key, value] of Object.entries(spec)) {
        // isinstance(v, (str, int, float)): a bool is an int to Python, so it is taken too, as "True"
        if (typeof value === 'string') out[lane]![key] = value
        else if (typeof value === 'number') out[lane]![key] = String(value)
        else if (typeof value === 'boolean') out[lane]![key] = value ? 'True' : 'False'
      }
    }
  }
  return out
}

// ── the daily budget (limits.py) ─────────────────────────────────────────────

/** Where the decision engine asks before a request and reports after one; the caller keeps the counter. */
export interface Limits {
  admit(shadow: boolean): Promise<[boolean, string]>
  charge(usd: number): Promise<void>
}

export const LIMIT_DEFAULTS = { rpm: 1000, daily_usd: 1.0, shadow_share: 0.8 }
export type LimitConfig = typeof LIMIT_DEFAULTS
export type LimitState = { minute?: number; count?: number; day?: string; usd?: number }

/** limits.json's values over the defaults; a value that is not a number of zero or more is ignored. */
export function limitConfig(raw: unknown): LimitConfig {
  const out = { ...LIMIT_DEFAULTS }
  if (!isObject(raw)) return out
  for (const key of Object.keys(LIMIT_DEFAULTS) as (keyof LimitConfig)[]) {
    const value = raw[key]
    if (typeof value === 'number' && value >= 0) out[key] = value
  }
  return out
}

/** The counter moved to this minute and this (local) day. */
export function roll(state: LimitState, nowMs: number): LimitState {
  const out = { ...state }
  const minute = Math.floor(nowMs / 60_000)
  if (out.minute !== minute) Object.assign(out, { minute, count: 0 })
  const d = new Date(nowMs)
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (out.day !== day) Object.assign(out, { day, usd: 0.0 })
  return out
}

/** limits.admit: whether one more request may go, and the counter after it. Shadow work stops first. */
export function admitState(state: LimitState, config: LimitConfig, nowMs: number, shadow: boolean): [boolean, string, LimitState] {
  const now = roll(state, nowMs)
  if (Number(now.usd ?? 0) >= config.daily_usd) return [false, 'skipped_budget', now]
  const ceiling = config.rpm * (shadow ? config.shadow_share : 1.0)
  if (Number(now.count ?? 0) >= ceiling) return [false, 'skipped_rate', now]
  return [true, 'ok', { ...now, count: Number(now.count ?? 0) + 1 }]
}

/** limits.charge: the day's spend after one request. */
export function chargeState(state: LimitState, nowMs: number, usd: number): LimitState {
  const now = roll(state, nowMs)
  return { ...now, usd: pyRound(Number(now.usd ?? 0) + usd, 8) }
}

// ── one policy decision (decide.py) ──────────────────────────────────────────

const DEFAULT_FIELD_CHARS = 1500
const MAX_DEPTH = 4

function redactValue(value: unknown, limit: number, depth = 0): unknown {
  if (typeof value === 'string') return redact(value, limit)
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value ?? null
  if (depth >= MAX_DEPTH) return redact(encode(value, { ensureAscii: true }), limit)
  if (Array.isArray(value)) return value.slice(0, 64).map(v => redactValue(v, limit, depth + 1))
  if (isObject(value)) return Object.fromEntries(Object.entries(value).slice(0, 64).map(([k, v]) => [k, redactValue(v, limit, depth + 1)]))
  return redact(String(value), limit)
}

/** Only the fields the policy names, each redacted and capped: a long state makes the model worse. */
export function prepareState(state: unknown, policy: Policy): unknown {
  const limits = policy.field_limits ?? {}
  if (isObject(state)) {
    return Object.fromEntries(fieldsOf(policy, state).filter(key => key in state).map(key => [key, redactValue(state[key], Number(limits[key] ?? DEFAULT_FIELD_CHARS))]))
  }
  return redactValue(state, Number(limits._ ?? 4000))
}

export type Decision = {
  action: string; rule_action: string | null; matched_rule: number | null; matched_pre_rule?: number
  fired_rules: number[]; annotations: string[]; unsure: string[]; answers: Record<string, unknown>
  jev_model: string | null; drift: boolean | null; untuned?: boolean; latency_ms: number | null; input_tokens: number | null
  cost_usd: number; list_usd: number; feature: string; mode: string; error: string | null; status: string
  fallback_used: boolean; sent_to_jev: boolean; source: 'code' | 'jev' | 'fallback'; provider?: string
}

export type DecideOptions = { mode?: 'live' | 'shadow'; facts?: Facts; timeoutMs?: number; retries?: number; limits?: Limits }

/** Run one policy against one state. Never throws for anything the model or the network does. */
export async function decide(host: Host, state: unknown, policy: Policy, opts: DecideOptions = {}): Promise<Decision> {
  const mode = opts.mode ?? 'live'
  const shadow = mode === 'shadow'
  const feature = String(policy.feature || policy.name)
  const blank = { rule_action: null, matched_rule: null, fired_rules: [], annotations: [], unsure: [], answers: {},
    jev_model: null, drift: null, cost_usd: 0.0, list_usd: 0.0, feature, mode }
  const fallback = (error: string, status = 'error', sent = false): Decision => ({ ...blank, action: policy.on_error,
    latency_ms: null, input_tokens: null, error, status, fallback_used: true, sent_to_jev: sent, source: 'fallback' })

  const pre = preDecide(policy, opts.facts)
  if (pre) {
    return { ...blank, action: pre.action, rule_action: pre.action, matched_pre_rule: pre.matched_pre_rule, latency_ms: 0,
      input_tokens: 0, error: null, status: 'code', fallback_used: false, sent_to_jev: false, source: 'code' }
  }
  // decide.py probed json.dumps of the fields, which escapes every non-ASCII character
  // ("\u0664"): a card in Arabic-Indic digits or a key behind an accented letter, which
  // privacy.ts catches in the text, passed escaped. The port probes the text as it is.
  const probe = typeof state === 'string' ? state : encode(isObject(state)
    ? Object.fromEntries(fieldsOf(policy, state).filter(k => k in state).map(k => [k, state[k]])) : state, { ensureAscii: false })
  // Never sent: the caller gets exactly what it would have done without the model.
  if (isSensitive(probe)) return fallback('sensitive_not_sent', 'skipped')
  const prepared = prepareState(state, policy)
  if (opts.limits) {
    const [allowed, reason] = await opts.limits.admit(shadow)
    if (!allowed) return fallback(reason, 'skipped')
  }
  let reply
  try {
    reply = await ask(host, prepared, policy.questions, { timeoutMs: opts.timeoutMs ?? 4000, retries: opts.retries ?? 1 })
  } catch (error) {
    if (!(error instanceof JevError)) throw error // a question the client refused: a policy bug
    return fallback(error.code, 'error', !['no_key', 'state_too_large', 'invalid_endpoint'].includes(error.code))
  }
  const values = readings(policy.questions, reply.answers, policy.uncertain_band ?? DEFAULT_BAND)
  const applied = apply(policy, values, opts.facts)
  const drift = drifted(policy.tuned_on, reply.jev_model)
  const fallbackUsed = !!drift && !shadow
  const action = fallbackUsed ? (policy.on_drift || policy.on_error) : applied.action
  const listUsd = pyRound(Number(reply.input_tokens ?? 0) * USD_PER_INPUT_TOKEN, 8)
  const costUsd = costOf(reply)
  if (opts.limits) await opts.limits.charge(costUsd)
  return {
    action, rule_action: applied.action, matched_rule: applied.matched_rule, fired_rules: applied.fired_rules,
    annotations: applied.annotations, unsure: applied.unsure, answers: values, jev_model: reply.jev_model, drift,
    untuned: untuned(policy, reply.provider), latency_ms: reply.latency_ms, input_tokens: reply.input_tokens,
    cost_usd: costUsd, list_usd: listUsd, feature, mode, error: fallbackUsed ? 'drift' : null, status: 'ok',
    fallback_used: fallbackUsed, sent_to_jev: true, provider: reply.provider, source: fallbackUsed ? 'fallback' : 'jev',
  }
}

// ── classify ─────────────────────────────────────────────────────────────────

export type Classified = { lane: string; target: Target | null; host: 'claude-code'; decision: Decision; why?: string }

export type ClassifyOptions = DecideOptions & { context?: string; tables?: unknown[] }

/** The first lane for a piece of work: one request, three questions, the policy's rules on the answers. */
export async function classify(host: Host, task: string, policy: Policy, opts: ClassifyOptions = {}): Promise<Classified> {
  const state = { task, ...(opts.context ? { context: opts.context } : {}) }
  const decision = await decide(host, state, policy, opts)
  const lane = decision.action
  const out: Classified = { lane, target: targets(opts.tables ?? [])[lane] ?? null, host: 'claude-code', decision }
  if (lane === 'keep_current') {
    out.target = null
    out.why = decision.fallback_used ? 'Jev could not judge; keep the model you were going to use'
      : decision.source === 'code' ? 'keep the model already chosen'
      : 'Jev read this as work a person should look at first; keep the current model'
  }
  return out
}
