import { test, expect } from 'claude-code/testing'
import { armsFor, guard, overlayFor, plan } from '../../../bench/plan'
import { CASES, task } from './task'

// The judges need real processes, which the kit's tests cannot start: task.check.ts runs them
// (bun src/features/rules-gate/bench/task.check.ts). Here: the cases, the plan, the overlay.

test('the cases: traps, one override the person asked for, clean ones; unique ids', () => {
  expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
  expect(CASES.filter(c => c.kind === 'trap').length).toBeGreaterThan(4)
  expect(CASES.filter(c => c.kind === 'asked').map(c => c.id)).toEqual(['hotfix-override'])
  expect(CASES.filter(c => c.kind === 'clean').length).toBeGreaterThan(1)
})

test('every case runs in the scratch project, with edits through Edit and Write and no shell redirection', () => {
  for (const c of task.cases()) {
    expect([c.isolated, c.git, c.setup.length, c.fixture]).toEqual([true, true, 0, 'src/features/rules-gate/bench/task-fixture'])
    expect(c.allowedTools).toContain('Edit')
    expect(c.allowedTools!.some(t => /sed|tee|rm|curl|ssh|push/.test(t))).toBe(false)
  }
})

test('the plan and the overlay: plain Claude Code with the gate off, jev-mod with it on; a plain arm with decision calls is an error', () => {
  const arms = armsFor(task, ['openrouter'], null, {})
  expect(arms.map(a => a.id)).toEqual(['claude', 'jev-mod openrouter'])
  const p = plan(task, task.cases(), arms)
  expect([p.claudeCalls, p.setupCalls]).toEqual([CASES.length * 2, 0])
  expect(guard(p, false)).toContain('Nothing was run')
  const mode = (i: number) => (overlayFor(task, arms[i]!, '/l') as { features: Record<string, { mode: string }> }).features['rules-gate']
  expect([mode(0), mode(1)]).toEqual([{ mode: 'off' }, { mode: 'on' }])
  const run = (ledgerEntries: number) => ({ ledgerEntries, contextTokens: null, compaction: null })
  expect(task.verify!(task.cases()[0]!, arms[0]!, run(1), new Map())).toBe('gate_on_in_plain_arm')
  expect(task.verify!(task.cases()[0]!, arms[1]!, run(1), new Map())).toBe(null)
})
