import { test, expect } from 'claude-code/testing'
import { MARK } from '../features/compact'
import { task as compactTask, TASKS } from '../features/compact/bench/task'
import { contextOf, parseClaude, readLedger, setupRow, verifyArms } from './task-rows'
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
  expect(parseClaude('{"result":"x","num_turns":7}').turns).toBe(7)
  expect(parseClaude('{"result":"x"}').turns).toBeUndefined()
})

const run = (ledgerEntries: number, contextTokens: number | null, dropped?: number): ArmRun =>
  ({ ledgerEntries, contextTokens, compaction: dropped === undefined ? null : { messages: 300, kept: 300 - dropped, dropped, skip: dropped ? null : 'Jev marked no turn drop; nothing to remove' } })

test('an arm that did not compact is an error, not_compacted, and loses its score', () => {
  const none = arm('no compaction', 'claude')
  const summarised = arm('claude', 'claude')
  const jevNever = arm('jev-mod openrouter drop=0.6', 'jev-mod', 'openrouter')
  const jevNothing = arm('jev-mod openrouter drop=0.7', 'jev-mod', 'openrouter')
  const jevLittle = arm('jev-mod openrouter drop=0.8', 'jev-mod', 'openrouter')
  const jevCut = arm('jev-mod openrouter drop=0.9', 'jev-mod', 'openrouter')
  const done = [
    { arm: summarised, row: okRow(summarised), run: run(0, 125_000) },       // as big as no compaction: it did not compact
    { arm: none, row: okRow(none), run: run(0, 133_000) },
    { arm: jevNever, row: okRow(jevNever), run: run(0, 133_000) },           // no record and the decision model never asked
    { arm: jevNothing, row: okRow(jevNothing), run: run(4, 60_000, 0) },     // asked, but recorded nothing dropped
    { arm: jevLittle, row: okRow(jevLittle), run: run(4, 124_000, 9) },      // dropped a few short messages: no real shrink
    { arm: jevCut, row: okRow(jevCut), run: run(4, 80_000, 120) },           // a real compaction is scored
  ]
  verifyArms(compactTask, TASKS[0]!, done)
  expect(done.map(d => [d.row.outcome, d.row.error ?? null, d.row.score ?? null])).toEqual([
    ['error', 'not_compacted', null], ['ok', null, 1], ['error', 'not_compacted', null], ['error', 'not_compacted', null],
    ['error', 'not_compacted', null], ['ok', null, 1]])
})

test('a compacting arm whose context shrank is scored; without a no-compaction context only the mod\'s record can tell', () => {
  const summarised = arm('claude', 'claude')
  const none = arm('no compaction', 'claude')
  const jev = arm('jev-mod openrouter drop=0.7', 'jev-mod', 'openrouter')
  const shrank = [{ arm: summarised, row: okRow(summarised), run: run(0, 34_000) }, { arm: none, row: okRow(none), run: run(0, 133_000) }]
  verifyArms(compactTask, TASKS[0]!, shrank)
  expect(shrank[0]!.row.outcome).toBe('ok')
  const unknown = [{ arm: summarised, row: okRow(summarised), run: run(0, 130_000) }, { arm: jev, row: okRow(jev), run: run(4, null, 50) }]
  verifyArms(compactTask, TASKS[0]!, unknown)
  expect(unknown.map(d => d.row.outcome)).toEqual(['ok', 'ok'])
})

test('a row that already failed keeps its own error', () => {
  const jev = arm('jev-mod openrouter drop=0.6', 'jev-mod', 'openrouter')
  const row = { ...okRow(jev), outcome: 'error' as const, error: 'claude exited 1' }
  verifyArms(compactTask, TASKS[0]!, [{ arm: jev, row, run: run(0, null) }])
  expect(row.error).toBe('claude exited 1')
})

test('the ledger: decision calls are added up, the last compaction is what the arm did, a half-written file is passed over', () => {
  const book = readLedger([
    { name: '1700-a.json', text: JSON.stringify({ at: 1, feature: 'compact', calls: 1, cost: 0.0002, model: 'jev-1.13', error: null }) },
    { name: '1701-b.json', text: JSON.stringify({ at: 2, feature: 'compact', calls: 2, cost: 0.0003, model: 'jev-1.13', error: null }) },
    { name: 'compaction-1702-c.json', text: JSON.stringify({ at: 3, kind: 'compaction', messages: 310, kept: 140, dropped: 170, skip: null }) },
    { name: '1703-d.json', text: '{"at": 4, "calls"' },
  ])
  expect(book.decisions).toBe(2)
  expect(book.calls).toBe(3)
  expect(Math.round(book.cost * 1e6)).toBe(500)
  expect(book.model).toBe('jev-1.13')
  expect(book.compaction).toEqual({ messages: 310, kept: 140, dropped: 170, skip: null })
  expect(readLedger([]).compaction).toBe(null)
  const skipped = readLedger([{ name: 'compaction-1.json', text: JSON.stringify({ at: 1, kind: 'compaction', messages: 12, kept: 12, dropped: 0, skip: 'nothing to judge' }) }])
  expect([skipped.decisions, skipped.compaction?.skip]).toEqual([0, 'nothing to judge'])
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
