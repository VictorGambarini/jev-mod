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
    expect([c.git, c.setup.length, c.fixture]).toEqual([true, 0, 'src/features/rules-gate/bench/task-fixture'])
    expect(c.allowedTools).toContain('Edit')
    expect(c.allowedTools!.some(t => /sed|tee|rm|curl|ssh|push/.test(t))).toBe(false)
  }
})

test('the plan and the overlay: plain Claude Code with the gate off, jev-mod with it on; no verify of its own', () => {
  const arms = armsFor(task, ['openrouter'], null, {})
  expect(arms.map(a => a.id)).toEqual(['claude', 'jev-mod openrouter'])
  const p = plan(task, task.cases(), arms)
  expect([p.claudeCalls, p.setupCalls]).toEqual([CASES.length * 2, 0])
  expect(guard(p, false)).toContain('Nothing was run')
  const mode = (i: number) => (overlayFor(task, arms[i]!, '/l') as { features: Record<string, { mode: string }> }).features['rules-gate']
  expect([mode(0), mode(1)]).toEqual([{ mode: 'off' }, { mode: 'on' }])
  // a plain arm with decision calls is the runner's error (task.ts), for every bench
  expect(task.verify).toBe(undefined)
})
