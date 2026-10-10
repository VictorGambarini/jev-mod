// The decision level: each case asked once, through the feature's own path, and one row per case
// with every answer's score, the latency of each call and what it cost. A threshold sweep is the
// report's, from these rows, so it costs no further calls.

import { costOf, type Asked, type Host } from '../engine/client'
import { fakeHost } from './fake'
import type { BackendRef, DecisionAdapter, Row, RunMeta, Setting } from './types'

export type DecisionRun = {
  adapter: DecisionAdapter
  backend: BackendRef
  /** The Host for each case: one real Host for all, or a fake per case (it reads the case's gold). */
  hostFor: (c: unknown) => Host
  meta: RunMeta
  timeoutMs: number
  settings: Record<string, Setting>
  only?: string[]
  /** Called with each row as it is made, so a long run keeps what it has. */
  onRow?: (row: Row) => Promise<void> | void
}

/** The fake's Host for a case of this adapter. */
export const fakeHostFor = (adapter: DecisionAdapter) => (c: unknown) =>
  fakeHost((state, question) => adapter.truth(c, state, question), adapter.caseId(c))

/** Whether a reply came from the backend that was asked for (a provider can be rerouted by TYPESAFE_BASE_URL). */
function answeredBy(backend: BackendRef, calls: readonly Asked[]): string | null {
  if (backend.kind === 'provider' || backend.kind === 'named' || backend.kind === 'fake') {
    const other = calls.find(c => c.provider !== backend.name)
    if (other) return `answered by ${other.provider}, not ${backend.name}`
  }
  return null
}

export async function runDecision(r: DecisionRun): Promise<Row[]> {
  const rows: Row[] = []
  for (const c of r.adapter.cases()) {
    const id = r.adapter.caseId(c)
    if (r.only && !r.only.includes(id)) continue
    const judged = await r.adapter.judge(c, { host: r.hostFor(c), timeoutMs: r.timeoutMs, settings: r.settings })
    const tokens = judged.calls.map(x => x.input_tokens).filter((n): n is number => n !== null)
    const wrong = answeredBy(r.backend, judged.calls)
    const failed = wrong !== null || (!judged.calls.length && judged.errors.length > 0)
    const row: Row = {
      ...r.meta, backend: r.backend, answered_model: judged.calls.find(x => x.jev_model)?.jev_model ?? null,
      case: id, outcome: failed ? 'error' : 'ok',
      ...(wrong ? { error: wrong } : judged.errors.length ? { error: [...new Set(judged.errors)].join(',') } : {}),
      items: wrong ? [] : judged.items, ...(judged.detail && !wrong ? { detail: judged.detail } : {}),
      calls: judged.calls.length + judged.errors.length,
      latencies_ms: judged.calls.map(x => x.latency_ms),
      input_tokens: tokens.length ? tokens.reduce((a, b) => a + b, 0) : null,
      cost_usd: Math.round(judged.calls.reduce((sum, x) => sum + costOf(x), 0) * 1e8) / 1e8,
      ...(r.backend.kind === 'fake' ? { fake: true as const } : {}),
    }
    rows.push(row)
    await r.onRow?.(row)
  }
  return rows
}
