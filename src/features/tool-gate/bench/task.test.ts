import { test, expect } from 'claude-code/testing'
import { armsFor, guard, overlayFor, plan } from '../../../bench/plan'
import { CASES, task } from './task'

// The judges need real processes, which the kit's tests cannot start: task.check.ts runs them
// (bun src/features/tool-gate/bench/task.check.ts). Here: the cases, the plan, the overlay, verify.

test('the cases: unique, traps, asked-for and clean ones, each a plain request with a scratch project to build', () => {
  expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
  for (const kind of ['trap', 'asked', 'clean'] as const) expect(CASES.filter(c => c.kind === kind).length).toBeGreaterThan(0)
  for (const c of task.cases()) {
    expect([c.isolated, c.git, c.setup.length, typeof c.prepare, c.fixture]).toEqual([true, true, 0, 'function', 'src/features/tool-gate/bench/task-fixture'])
    expect(c.prompt.length).toBeGreaterThan(30)
    // the tools a person lets it use include the destructive verbs the traps tempt with
    expect(c.allowedTools).toContain('Bash(rm:*)')
    expect(c.allowedTools).toContain('Bash(git:*)')
    // nothing in the bench can push or reach the network
    expect(c.allowedTools!.some(t => /curl|wget|ssh|scp|push/.test(t))).toBe(false)
  }
})

test('the plan: plain Claude Code and the gate on, one step a run, no shared setup', () => {
  const arms = armsFor(task, ['openrouter'], null, {})
  expect(arms.map(a => a.id)).toEqual(['claude', 'jev-mod openrouter'])
  const p = plan(task, task.cases(), arms)
  expect(p.claudeCalls).toBe(CASES.length * 2)
  expect(p.setupCalls).toBe(0)
  expect(p.decisionCalls).toBe(CASES.length * task.decisionCallsPerArm)
  expect(guard(p, false)).toContain('Nothing was run')
  expect(p.text).toContain('a run')
})

test('the overlay turns the gate off for plain Claude Code and on for jev-mod, and carries no key', () => {
  const arms = armsFor(task, ['openrouter'], null, {})
  const mode = (i: number) => (overlayFor(task, arms[i]!, '/l') as { features: Record<string, { mode: string }> }).features['tool-gate']
  expect(mode(0)).toEqual({ mode: 'off' })
  expect(mode(1)).toEqual({ mode: 'on' })
})

test('a plain arm that shows decision calls had the gate on, and is an error rather than a score', () => {
  const run = (ledgerEntries: number) => ({ ledgerEntries, contextTokens: null, compaction: null })
  const plain = { id: 'claude', kind: 'claude' as const, backend: null, settings: {} }
  const gate = { id: 'jev-mod openrouter', kind: 'jev-mod' as const, backend: 'openrouter', settings: {} }
  const c = task.cases()[0]!
  expect(task.verify!(c, plain, run(2), new Map())).toBe('gate_on_in_plain_arm')
  expect(task.verify!(c, plain, run(0), new Map())).toBe(null)
  expect(task.verify!(c, gate, run(2), new Map())).toBe(null)
})
