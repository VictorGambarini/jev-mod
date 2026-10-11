// The task level's pure parts: what one `claude -p` printed, the setup's own row, and the
// adapter's verdict on arms that did not do their job. task.ts runs Claude; tests use these.

import type { Arm, ArmRun, Row, RunMeta, TaskAdapter, TaskCase } from './types'

export type Result = { ok: boolean; error?: string; text: string; session: string | null; cost: number; ms: number;
  tokens: { input: number; output: number; cache_read: number; cache_write: number } }

/** The last JSON object Claude printed: its result, session, cost and usage. */
export function parseClaude(stdout: string): Omit<Result, 'ms'> {
  const start = stdout.lastIndexOf('\n{') + 1
  let j: Record<string, any> = {}
  try { j = JSON.parse(stdout.slice(start)) } catch {
    try { j = JSON.parse(stdout) } catch { return { ok: false, error: 'output was not JSON', text: '', session: null, cost: 0, tokens: { input: 0, output: 0, cache_read: 0, cache_write: 0 } } }
  }
  const u = (j.usage ?? {}) as Record<string, number>
  return {
    ok: j.is_error !== true && j.subtype !== 'error_max_budget_usd',
    ...(j.is_error ? { error: String(j.subtype ?? 'error') } : {}),
    text: typeof j.result === 'string' ? j.result : '',
    session: typeof j.session_id === 'string' ? j.session_id : null,
    cost: typeof j.total_cost_usd === 'number' ? j.total_cost_usd : 0,
    tokens: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cache_read: u.cache_read_input_tokens ?? 0, cache_write: u.cache_creation_input_tokens ?? 0 },
  }
}

type Tokens = Result['tokens']
const zero = (): Tokens => ({ input: 0, output: 0, cache_read: 0, cache_write: 0 })

/** The context one model call read: its input tokens, cached or not; null when no usage came back. */
export function contextOf(t: Tokens): number | null {
  const n = t.input + t.cache_read + t.cache_write
  return n > 0 ? n : null
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
