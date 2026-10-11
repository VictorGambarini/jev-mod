import { test, expect } from 'claude-code/testing'
import { MARK } from '../features/compact'
import { task as compactTask, TASKS } from '../features/compact/bench/task'
import { contextOf, parseClaude, setupRow, verifyArms } from './task-rows'
import type { Arm, ArmRun, Row, RunMeta } from './types'

// The task runner's pure parts: the setup's own row, and the adapter's verdict on arms that did
// not do their job. (Running `claude -p` itself is not done in tests: it costs money.)

const meta: RunMeta = { schema: 1, run: 'r1', feature: 'compact', level: 'task', jevmod: '0.12.0', git: 'abc', date: '2026-10-11', settings: {}, sweep: null }
const arm = (id: string, kind: Arm['kind'], backend: string | null = null): Arm => ({ id, kind, backend, settings: {} })
const okRow = (a: Arm): Row => ({ ...meta, backend: { name: 'claude code', kind: 'baseline', model: null }, answered_model: null, case: 'c',
  arm: a.id, outcome: 'ok', items: [], calls: 0, latencies_ms: [], input_tokens: null, cost_usd: 0, success: true, score: 1 })
const tokens = (input: number, cache_read = 0) => ({ input, output: 10, cache_read, cache_write: 0 })

test('the shared setup is a row of its own: its cost and tokens summed, never scored', () => {
  const calls = [{ ok: true, cost: 0.3, ms: 1000, tokens: tokens(100, 20_000) }, { ok: true, cost: 0.45, ms: 2000, tokens: tokens(200, 30_000) }]
  const row = setupRow(meta, 'briefing', calls, null)
  expect([row.arm, row.setup, row.outcome, row.claude_cost_usd, row.wall_ms]).toEqual(['setup', true, 'ok', 0.75, 3000])
  expect(row.claude_tokens).toEqual({ input: 300, output: 20, cache_read: 50_000, cache_write: 0 })
  expect(row.score).toBe(undefined)
  const failed = setupRow(meta, 'briefing', calls.slice(0, 1), 'claude exited 1')
  expect([failed.outcome, failed.error]).toEqual(['error', 'setup: claude exited 1'])
})

test('a step\'s context is its input tokens, cached or not; none reported is unknown', () => {
  expect(contextOf({ input: 5, output: 900, cache_read: 40_000, cache_write: 1000 })).toBe(41_005)
  expect(contextOf({ input: 0, output: 0, cache_read: 0, cache_write: 0 })).toBe(null)
  expect(contextOf(parseClaude('{"result":"1. x","usage":{"input_tokens":3,"cache_read_input_tokens":9000}}').tokens)).toBe(9003)
})

test('an arm that did not compact is an error, not_compacted, and loses its score', () => {
  const none = arm('no compaction', 'claude')
  const summarised = arm('claude', 'claude')
  const jevEmpty = arm('jev-mod openrouter drop=0.6', 'jev-mod', 'openrouter')
  const jevAsked = arm('jev-mod openrouter drop=0.7', 'jev-mod', 'openrouter')
  const run = (ledgerEntries: number, contextTokens: number | null): ArmRun => ({ ledgerEntries, contextTokens })
  const done = [
    { arm: summarised, row: okRow(summarised), run: run(0, 95_000) }, // as big as no compaction: it did not compact
    { arm: none, row: okRow(none), run: run(0, 100_000) },
    { arm: jevEmpty, row: okRow(jevEmpty), run: run(0, 100_000) },     // the decision model was never asked
    { arm: jevAsked, row: okRow(jevAsked), run: run(2, 100_000) },     // asked; it may have dropped nothing, which is a result
  ]
  verifyArms(compactTask, TASKS[0]!, done)
  expect(done.map(d => [d.row.outcome, d.row.error ?? null, d.row.score ?? null])).toEqual([
    ['error', 'not_compacted', null], ['ok', null, 1], ['error', 'not_compacted', null], ['ok', null, 1]])
})

test('a /compact arm whose context shrank is scored; without a no-compaction context it cannot be told and is scored', () => {
  const summarised = arm('claude', 'claude')
  const none = arm('no compaction', 'claude')
  const shrank = [{ arm: summarised, row: okRow(summarised), run: { ledgerEntries: 0, contextTokens: 30_000 } },
    { arm: none, row: okRow(none), run: { ledgerEntries: 0, contextTokens: 100_000 } }]
  verifyArms(compactTask, TASKS[0]!, shrank)
  expect(shrank[0]!.row.outcome).toBe('ok')
  const unknown = [{ arm: summarised, row: okRow(summarised), run: { ledgerEntries: 0, contextTokens: 99_000 } }]
  verifyArms(compactTask, TASKS[0]!, unknown)
  expect(unknown[0]!.row.outcome).toBe('ok')
})

test('a row that already failed keeps its own error', () => {
  const jev = arm('jev-mod openrouter drop=0.6', 'jev-mod', 'openrouter')
  const row = { ...okRow(jev), outcome: 'error' as const, error: 'claude exited 1' }
  verifyArms(compactTask, TASKS[0]!, [{ arm: jev, row, run: { ledgerEntries: 0, contextTokens: null } }])
  expect(row.error).toBe('claude exited 1')
})

test('a jev-mod arm compacts with /compact and the marker in one step; every question step refuses all tools', () => {
  const steps = compactTask.steps(TASKS[0]!, arm('jev-mod openrouter drop=0.6', 'jev-mod', 'openrouter'))
  expect(steps[0]!.prompt).toBe(`/compact ${MARK}`)
  expect(steps[1]!.final).toBe(true)
  expect(steps[1]!.disallowedTools).toContain('Read')
  expect(steps[1]!.disallowedTools).toContain('Bash')
  expect(compactTask.steps(TASKS[0]!, arm('claude', 'claude'))[0]!.prompt).toBe('/compact')
  expect(compactTask.steps(TASKS[0]!, arm('no compaction', 'claude')).length).toBe(1)
})
