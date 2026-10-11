import { test, expect } from 'claude-code/testing'
import { overlayFor } from '../../../bench/plan'
import { parseClaude } from '../../../bench/task-rows'
import type { Arm, Row } from '../../../bench/types'
import type { TaskAdapter } from '../../../bench/types'
import { DIFFICULTIES, overlayOf, SESSION_TOOLS, stepsFor, TASKS, unittestCounts, USD, verdict } from './task-cases'
import { family, groups, markdown, modelMix, plot } from './task-summary'

// Routing's task bench: the cases, the scoring and the tables. That each hidden check fails on
// the fixture as shipped and passes on a known fix needs python3 and git, which tests do not run:
// `bun src/features/routing/bench/task-selfcheck.ts` checks that, and runs the task runner end to
// end on a fake claude.

const arm = (id: string, kind: Arm['kind'], backend: string | null = null): Arm => ({ id, kind, backend, settings: {} })

test('ten cases of mixed difficulty, each its own fresh git project with no shared setup', () => {
  expect(TASKS.length).toBe(10)
  expect(DIFFICULTIES.map(d => TASKS.filter(t => t.difficulty === d).length)).toEqual([4, 3, 3])
  expect(new Set(TASKS.map(t => t.id)).size).toBe(10)
  for (const t of TASKS) {
    expect([t.fresh, t.git, t.setup.length, t.allowedTools]).toEqual([true, true, 0, SESSION_TOOLS])
    expect(t.prompt.length).toBeGreaterThan(60)
  }
})

test('unittest\'s last lines give the tests run and the failures and errors', () => {
  expect(unittestCounts('....\n------\nRan 4 tests in 0.01s\n\nOK\n')).toEqual({ ran: 4, failed: 0 })
  expect(unittestCounts('Ran 7 tests in 0.2s\n\nFAILED (failures=2, errors=1)\n')).toEqual({ ran: 7, failed: 3 })
  expect(unittestCounts('Ran 1 test in 0.0s\n\nFAILED (errors=1)')).toEqual({ ran: 1, failed: 1 })
  expect(unittestCounts('Traceback ... ImportError')).toEqual({ ran: 0, failed: 0 })
})

test('success needs the project\'s suite and every hidden check; the score is the share of checks passed', () => {
  const t = TASKS.find(x => x.id === 'gst-rounding')!
  const ok = { code: 0, stdout: '', stderr: 'Ran 25 tests in 0.1s\n\nOK\n' }
  const half = { code: 1, stdout: '', stderr: 'Ran 4 tests in 0.1s\n\nFAILED (failures=2)\n' }
  const all = { code: 0, stdout: '', stderr: 'Ran 4 tests in 0.1s\n\nOK\n' }
  expect(verdict(t, ok, all)).toEqual({ success: true, score: 1,
    detail: { difficulty: 'hard', suite_ok: true, suite_tests: 25, checks_passed: 4, checks_ran: 4 } })
  expect([verdict(t, ok, half).success, verdict(t, ok, half).score]).toEqual([false, 0.5])
  // the arm broke its own suite: the checks may pass, the task did not
  const broken = { code: 1, stdout: '', stderr: 'Ran 26 tests in 0.1s\n\nFAILED (errors=1)\n' }
  expect([verdict(t, broken, all).success, verdict(t, broken, all).score]).toEqual([false, 1])
  // a hidden check that could not even import scores nothing
  expect(verdict(t, ok, { code: 1, stdout: '', stderr: 'ImportError: cannot import name' }).score).toBe(0)
})

test('the arms differ only in routing: off for plain Claude Code, on for jev-mod; one step, the prompt, priced per lane', () => {
  const task = { overlay: overlayOf } as unknown as TaskAdapter
  const plain = overlayFor(task, arm('claude', 'claude'), '/tmp/l') as { features: Record<string, { mode: string }> }
  const routed = overlayFor(task, arm('jev-mod openrouter', 'jev-mod', 'openrouter'), '/tmp/l') as typeof plain
  expect([plain.features.routing!.mode, routed.features.routing!.mode]).toEqual(['off', 'on'])
  for (const [id, f] of Object.entries(plain.features)) if (id !== 'routing') expect(f).toEqual(routed.features[id])
  const t = TASKS[0]!
  expect(stepsFor(t, arm('claude', 'claude'))).toEqual([{ prompt: t.prompt, final: true, usd: USD.trivial.plain }])
  expect(stepsFor(t, arm('j', 'jev-mod', 'openrouter'))[0]!.usd).toBe(USD.trivial.routed)
})

test('claude -p\'s modelUsage names the models that answered and what each cost', () => {
  const out = parseClaude('{"result":"done","total_cost_usd":0.3,"modelUsage":{"claude-opus-5-5":{"costUSD":0.29},"claude-haiku-4-5-20251001":{"costUSD":0.01}}}')
  expect(out.models).toEqual({ 'claude-opus-5-5': 0.29, 'claude-haiku-4-5-20251001': 0.01 })
  expect(parseClaude('{"result":"x"}').models).toEqual({})
})

const meta = { schema: 1 as const, run: 'r', feature: 'routing', level: 'task' as const, jevmod: '0.12.0', git: 'abc', date: 'd', settings: {}, sweep: null }
const row = (c: string, a: string, success: boolean, claude: number, decision: number, models: Record<string, number>): Row => ({
  ...meta, backend: { name: 'x', kind: 'baseline', model: null }, answered_model: null, case: c, arm: a, outcome: 'ok', items: [], calls: 1,
  latencies_ms: [], input_tokens: null, cost_usd: decision, success, score: success ? 1 : 0.5, wall_ms: 20_000, claude_cost_usd: claude, claude_models: models })

test('the summary groups by difficulty and arm, adds Claude and decision cost, and says where the spend went', () => {
  const rows = [
    { ...row('typo-message', 'setup', true, 0, 0, {}), setup: true as const },
    row('typo-message', 'claude', true, 0.4, 0, { 'claude-opus-5-5': 0.39, 'claude-haiku-4-5-20251001': 0.01 }),
    row('typo-message', 'jev-mod openrouter', true, 0.05, 0.00003, { 'claude-haiku-4-5-20251001': 0.05 }),
    row('gst-rounding', 'claude', true, 2, 0, { 'claude-opus-5-5': 2 }),
    row('gst-rounding', 'jev-mod openrouter', false, 0.8, 0.00003, { 'claude-sonnet-5-5': 0.8 }),
  ]
  const g = groups(rows)
  expect(g.map(x => `${x.difficulty}/${x.arm}/${x.succeeded}/${x.runs}`)).toEqual([
    'trivial/claude/1/1', 'trivial/jev-mod openrouter/1/1', 'hard/claude/1/1', 'hard/jev-mod openrouter/0/1',
    'all/claude/2/2', 'all/jev-mod openrouter/1/2'])
  expect(modelMix(g[0]!.models)).toBe('opus 98%, haiku 3%')
  expect(family('claude-sonnet-5-5')).toBe('sonnet')
  const md = markdown(rows, 't')
  expect(md).toContain('| trivial | jev-mod openrouter | 1/1 | $0.050 | $0.00003 | $0.050 | 20 | haiku 100% |')
  expect(md).toContain('| gst-rounding | hard | jev-mod openrouter | no | 0.50 | $0.800 | $0.00003 | 20 | sonnet |')
  expect(md).not.toContain('| setup |')
  expect(plot(rows, true)).toContain('FAKE')
})
