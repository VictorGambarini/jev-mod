import { test, expect } from 'claude-code/testing'
import { armsFor, overlayFor, plan } from '../../../bench/plan'
import { checkAnswer, counts, stepUsd, taskAdapter, TASKS } from './task'

const task = taskAdapter(async () => ({ success: false, score: 0 }))

test('ten tasks, each with its own project, isolated per arm, a person-style prompt and a deterministic check', () => {
  expect(TASKS).toHaveLength(10)
  expect(new Set(TASKS.map(t => t.id)).size).toBe(10)
  for (const t of TASKS) {
    expect(t.isolate).toBe(true)
    expect(t.setup).toEqual([])
    expect(t.git).toBe(true)
    expect(t.prompt.length).toBeGreaterThan(80)
    expect(task.steps(t, { id: 'claude', kind: 'claude', backend: null, settings: {} })).toHaveLength(1)
  }
  })

test('arms: plain Claude Code, folding only, then the feature on at each backend; the overlay differs only in trim-output', () => {
  const arms = armsFor(task, ['openrouter'], null, {})
  expect(arms.map(a => a.id)).toEqual(['claude', 'jev-mod folding only', 'jev-mod openrouter'])
  const plain = overlayFor(task, arms[0]!, '/l') as { features: Record<string, Record<string, unknown>> }
  const fold = overlayFor(task, arms[1]!, '/l') as { features: Record<string, Record<string, unknown>> }
  const full = overlayFor(task, arms[2]!, '/l') as { features: Record<string, Record<string, unknown>> }
  expect(plain.features['trim-output']).toEqual({ mode: 'off' })
  expect(fold.features['trim-output']).toEqual({ mode: 'on', localOnly: true })
  expect(full.features['trim-output']).toEqual({ mode: 'on' })
  const swept = armsFor(task, ['openrouter'], { name: 'keepThreshold', values: [0.2, 0.5] }, {})
  expect((overlayFor(task, swept[3]!, '/l') as { features: Record<string, Record<string, unknown>> }).features['trim-output']).toEqual({ mode: 'on', keepThreshold: 0.5 })
})

test('the plan prices each task from its own output and says how', () => {
  const arms = armsFor(task, ['openrouter'], null, {})
  const p = plan(task, task.cases(), arms)
  expect(p.claudeCalls).toBe(10 * 3)
  expect(p.setupCalls).toBe(0)
  expect(Math.abs(p.armsUsd - task.cases().reduce((n, t) => n + 3 * stepUsd(t), 0))).toBeLessThan(1e-9)
  expect(p.text).toContain('cache read')
})

test('the diagnosis wants the request, the tenant, and the cause; a half answer scores below 1', () => {
  const t = TASKS.find(x => x.id === 'pool-timeouts')!
  const c = t.check as { patterns: RegExp[] }
  const good = 'The first 500 was r-4861, tenant t-0417 (get_invoice). A config reload cut that tenant\'s db pool_size from 10 to 2, and two long exports held both connections, so the pool was exhausted.'
  expect(checkAnswer(c.patterns, good)).toMatchObject({ success: true, score: 1 })
  const half = 'r-4861 failed with a timeout for tenant t-0417.'
  const got = checkAnswer(c.patterns, half)
  expect(got.success).toBe(false)
  expect(got.score).toBeLessThan(1)
  expect(checkAnswer(c.patterns, 'Request r-4864 for t-0688 failed: bad cursor.').success).toBe(false)
})

test('counts reads pytest, node and go summaries', () => {
  expect(counts('3 failed, 397 passed, 1 warning in 0.17s')).toEqual({ pass: 397, fail: 3 })
  expect(counts('400 passed in 0.2s')).toEqual({ pass: 400, fail: 0 })
  expect(counts('ℹ tests 5\nℹ pass 4\nℹ fail 1\n')).toEqual({ pass: 4, fail: 1 })
  expect(counts('    --- FAIL: TestParse/case-055 (0.00s)\n    --- PASS: TestParse/case-001 (0.00s)\nFAIL\texample.com/sizes\t0.01s')).toEqual({ pass: 1, fail: 1 })
  expect(counts('nothing')).toBeNull()
})
