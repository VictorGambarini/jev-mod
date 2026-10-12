// The task level's pure parts: what one `claude -p` printed, the setup's own row, and the
// adapter's verdict on arms that did not do their job. task.ts runs Claude; tests use these.

import type { Arm, ArmRun, Compaction, FeatureSpend, Row, RunMeta, TaskAdapter, TaskCase } from './types'

export type Result = { ok: boolean; error?: string; text: string; session: string | null; cost: number; ms: number;
  /** The model turns the call took (`num_turns`): one more than its tool rounds. */
  turns?: number
  tokens: { input: number; output: number; cache_read: number; cache_write: number }
  /** The models that answered, each with its cost (modelUsage); empty when none was reported. */
  models?: Record<string, number> }

/** The last JSON object Claude printed: its result, session, cost and usage. */
export function parseClaude(stdout: string): Omit<Result, 'ms'> {
  const start = stdout.lastIndexOf('\n{') + 1
  let j: Record<string, any> = {}
  try { j = JSON.parse(stdout.slice(start)) } catch {
    try { j = JSON.parse(stdout) } catch { return { ok: false, error: 'output was not JSON', text: '', session: null, cost: 0, tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0 } } }
  }
  const u = (j.usage ?? {}) as Record<string, number>
  const models: Record<string, number> = {}
  for (const [model, use] of Object.entries((j.modelUsage ?? {}) as Record<string, Record<string, unknown>>)) {
    models[model] = typeof use?.costUSD === 'number' ? use.costUSD : 0
  }
  return {
    ok: j.is_error !== true && j.subtype !== 'error_max_budget_usd',
    ...(j.is_error ? { error: String(j.subtype ?? 'error') } : {}),
    text: typeof j.result === 'string' ? j.result : '',
    session: typeof j.session_id === 'string' ? j.session_id : null,
    cost: typeof j.total_cost_usd === 'number' ? j.total_cost_usd : 0,
    ...(typeof j.num_turns === 'number' ? { turns: j.num_turns } : {}),
    tokens: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cache_read: u.cache_read_input_tokens ?? 0, cache_write: u.cache_creation_input_tokens ?? 0 },
    models,
  }
}

type Tokens = Result['tokens']
const zero = (): Tokens => ({ input: 0, output: 0, cache_read: 0, cache_write: 0 })

/** The context one model call read: its input tokens, cached or not; null when no usage came back. */
export function contextOf(t: Tokens): number | null {
  const n = t.input + t.cache_read + t.cache_write
  return n > 0 ? n : null
}

/** `byFeature`: the same per feature that asked (an entry without one is under `other`), so a report can tell the feature's own cost from the rest. */
export type Ledger = { decisions: number; calls: number; cost: number; model: string | null; compaction: Compaction | null; byFeature: Record<string, FeatureSpend> }

/**
 * An arm's ledger folder, its files' text by name: the decision calls (their count, calls, cost
 * and model) and the last compaction the mod recorded (core/bench-overlay.ts). A half-written
 * file is passed over.
 */
export function readLedger(files: readonly { name: string; text: string }[]): Ledger {
  const out: Ledger = { decisions: 0, calls: 0, cost: 0, model: null, compaction: null, byFeature: {} }
  let last = -Infinity
  for (const { text } of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    let e: Record<string, any>
    try { e = JSON.parse(text) } catch { continue }
    if (!e || typeof e !== 'object') continue
    if (e.kind === 'compaction') {
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
      if ((e.at ?? 0) >= last) {
        last = e.at ?? 0
        out.compaction = { messages: n(e.messages), kept: n(e.kept), dropped: n(e.dropped), skip: typeof e.skip === 'string' ? e.skip : null }
      }
      continue
    }
    const calls = typeof e.calls === 'number' ? e.calls : 0
    const cost = typeof e.cost === 'number' ? e.cost : 0
    const mine = (out.byFeature[typeof e.feature === 'string' && e.feature ? e.feature : 'other'] ??= { requests: 0, calls: 0, cost_usd: 0 })
    mine.requests++
    mine.calls += calls
    mine.cost_usd += cost
    out.decisions++
    out.calls += calls
    out.cost += cost
    if (typeof e.model === 'string' && e.model) out.model = e.model
  }
  return out
}

/** A case's shared-setup row: what its calls cost, never scored. */
export function setupRow(meta: RunMeta, caseId: string, calls: readonly Omit<Result, 'text' | 'session'>[], failed: string | null): Row {
  const tokens = zero()
  for (const c of calls) for (const key of ['input', 'output', 'cache_read', 'cache_write'] as const) tokens[key] += c.tokens[key]
  return { ...meta, backend: { name: 'claude code', kind: 'baseline', model: null }, answered_model: null, case: caseId, arm: 'setup',
    setup: true, outcome: failed ? 'error' : 'ok', ...(failed ? { error: `setup: ${failed}` } : {}), items: [], calls: 0, latencies_ms: [],
    input_tokens: null, cost_usd: 0, wall_ms: calls.reduce((n, c) => n + c.ms, 0), claude_cost_usd: calls.reduce((n, c) => n + c.cost, 0),
    claude_tokens: tokens }
}

/**
 * The adapter's verdict on each arm of one case, once all have run: an arm that plainly did not
 * do its job becomes an error with the adapter's code, its score dropped. Rows change in place.
 */
export function verifyArms(adapter: TaskAdapter, c: TaskCase, done: readonly { arm: Arm; row: Row; run: ArmRun }[]): void {
  if (!adapter.verify) return
  const all = new Map(done.map(d => [d.arm.id, d.run]))
  for (const { arm, row, run } of done) {
    if (row.outcome !== 'ok') continue
    const code = adapter.verify(c, arm, run, all)
    if (!code) continue
    row.outcome = 'error'
    row.error = code
    delete row.success
    delete row.score
  }
}

/** Which run of its case and arm a row is, from 1: a row written without `repeat` is one run. */
export const repeatOf = (r: Pick<Row, 'repeat'>): number => (typeof r.repeat === 'number' && r.repeat >= 1 ? r.repeat : 1)

/**
 * What tells one run of arm `k` from another in its case's scratch folder (`arm-<tag>`,
 * `ledger-<tag>`), and the row's `repeat`: run `r` (from 0) of `n`. With one run, as before
 * `--repeat`: the arm's number alone, and no `repeat` field.
 */
export function runOf(k: number, r: number, n: number): { tag: string; field: Pick<Row, 'repeat'> } {
  return n > 1 ? { tag: `${k}-r${r + 1}`, field: { repeat: r + 1 } } : { tag: `${k}`, field: {} }
}
