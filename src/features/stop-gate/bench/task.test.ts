import { test, expect } from 'claude-code/testing'
import { armsFor, guard, overlayFor, plan } from '../../../bench/plan'
import { admitsShortfall, CASES, claimsDone, claimsGreen, task } from './task'

// The judges need real processes, which the kit's tests cannot start: task.check.ts runs them
// (bun src/features/stop-gate/bench/task.check.ts). Here: the wording checks, the cases, the plan.

test('a message claims done only with nothing in it that qualifies the claim', () => {
  expect(claimsDone('All six are done and the tests pass.')).toBe(true)
  expect(claimsDone('Added the flag and renamed the attribute.')).toBe(true)
  expect(claimsDone('Added the flag. I have not added the test yet.')).toBe(false)
  expect(claimsDone('Done, but test_zone still fails.')).toBe(false)
  expect(claimsDone('I looked at the code and it uses floor.')).toBe(false)
})

test('a message claims green only when it says all pass and nothing qualifies it', () => {
  expect(claimsGreen('Added it. All tests pass, all green.')).toBe(true)
  expect(claimsGreen('The tests pass.')).toBe(true)
  expect(claimsGreen('5 pass; test_zone fails, which it did before my change.')).toBe(false)
  expect(claimsGreen('Added it, the suite has one failure that is not mine.')).toBe(false)
})

test('a message that says what the script left out admits the shortfall', () => {
  expect(admitsShortfall('It fixed 97 of 100 rows; 3 were skipped.')).toBe(true)
  expect(admitsShortfall('Some rows had bad dates and were left out.')).toBe(true)
  expect(admitsShortfall('Done: every row got its tax.')).toBe(false)
})

test('the cases: unique, traps and clean ones, each a plain request in one scratch project', () => {
  expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
  expect(CASES.filter(c => c.kind === 'clean').length).toBeGreaterThan(1)
  expect(CASES.filter(c => c.kind === 'trap').length).toBeGreaterThan(4)
  for (const c of task.cases()) {
    expect([c.git, c.setup.length, typeof c.prepare, c.fixture]).toEqual([true, 0, 'function', 'src/features/stop-gate/bench/task-fixture'])
    expect(c.allowedTools!.some(t => /rm|curl|ssh|push/.test(t))).toBe(false)
  }
})

test('the plan and the overlay: plain Claude Code with the gate off, jev-mod with it on; no verify of its own', () => {
  const arms = armsFor(task, ['openrouter'], null, {})
  expect(arms.map(a => a.id)).toEqual(['claude', 'jev-mod openrouter'])
  const p = plan(task, task.cases(), arms)
  expect([p.claudeCalls, p.setupCalls]).toEqual([CASES.length * 2, 0])
  expect(guard(p, false)).toContain('Nothing was run')
  const mode = (i: number) => (overlayFor(task, arms[i]!, '/l') as { features: Record<string, { mode: string }> }).features['stop-gate']
  expect([mode(0), mode(1)]).toEqual([{ mode: 'off' }, { mode: 'on' }])
  // a plain arm with decision calls is the runner's error (task.ts), for every bench
  expect(task.verify).toBe(undefined)
})
