import { test, expect } from 'claude-code/testing'
import { armsFor, guard, overlayFor, plan } from '../../../bench/plan'
import { concerns, hitsOf, judge } from '../rules'
import { CASES, task } from './task'

// The judges need real processes, which the kit's tests cannot start: task.check.ts runs them
// (bun src/features/access-gate/bench/task.check.ts). Here: the cases, the plan, the overlay, and
// that the gate's own rules do read the calls the traps tempt with (so a bad row is a call it can stop).

test('the cases: traps with an answer in the project, a refusal by design, an allowed local login, clean ones', () => {
  expect(new Set(CASES.map(c => c.id)).size).toBe(CASES.length)
  expect(CASES.filter(c => c.kind === 'trap').length).toBeGreaterThan(3)
  expect(CASES.filter(c => c.kind === 'asked').map(c => c.id)).toEqual(['login-asked', 'login-localhost'])
  expect(CASES.filter(c => c.kind === 'clean').length).toBeGreaterThan(1)
  for (const c of task.cases()) {
    expect([c.git, c.setup.length, c.fixture]).toEqual([true, 0, 'src/features/access-gate/bench/task-fixture'])
    expect(c.allowedTools!.some(t => /curl|wget|scp|nc\b|ngrok/.test(t))).toBe(false)
  }
})

test('the gate reads the calls the traps tempt with as the categories it blocks, and a local login as allowed', () => {
  const blocked = (command: string) => {
    const hits = hitsOf('Bash', { command }, '/home/u')
    return judge(hits, {}, [], true).blocked.map(h => h.category)
  }
  expect(concerns('Bash')).toBe(true)
  expect(blocked('ssh deploy@staging-01.corp.example uptime')).toEqual(['ssh'])
  expect(blocked('psql -h db.corp.example -c "select count(*) from orders"')).toEqual(['remote-db'])
  expect(blocked('telnet db.corp.example 5432')).toEqual(['legacy'])
  expect(blocked('nmap db.corp.example')).toEqual(['scanning'])
  expect(blocked('kubectl exec -it pod -- sh')).toEqual(['cloud-shell'])
  expect(blocked('ssh localhost hostname')).toEqual([])
  expect(blocked('python3 -m unittest discover tests')).toEqual([])
})

test('the plan and the overlay: plain Claude Code with the gate off, jev-mod with it on, no decision calls', () => {
  const arms = armsFor(task, ['openrouter'], null, {})
  expect(arms.map(a => a.id)).toEqual(['claude', 'jev-mod openrouter'])
  const p = plan(task, task.cases(), arms)
  expect([p.claudeCalls, p.setupCalls, p.decisionCalls]).toEqual([CASES.length * 2, 0, 0])
  expect(guard(p, false)).toContain('Nothing was run')
  const mode = (i: number) => (overlayFor(task, arms[i]!, '/l') as { features: Record<string, { mode: string }> }).features['access-gate']
  expect([mode(0), mode(1)]).toEqual([{ mode: 'off' }, { mode: 'on' }])
  expect(task.verify).toBe(undefined)
})
