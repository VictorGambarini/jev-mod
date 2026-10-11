import { test, expect } from 'claude-code/testing'
import { armsFor, overlayFor, plan } from '../../../bench/plan'
import { verifyArms } from '../../../bench/task-rows'
import type { Row } from '../../../bench/types'
import { checkedOf, findingsOf, linesWith, MARGIN, PROMPT, scoreFindings, stepUsd, taskAdapter, TASKS, TELL, verify, type Span } from './task'

const task = taskAdapter(async () => ({ success: false, score: 0 }))

test('ten changes: three clean, seven with one to three defects, each reviewed in an arm of its own over one patch', () => {
  expect(TASKS).toHaveLength(10)
  expect(new Set(TASKS.map(t => t.id)).size).toBe(10)
  expect(TASKS.filter(t => t.bugs.length === 0).map(t => t.id)).toEqual(['docs-typos', 'rename-money', 'logging'])
  expect(TASKS.reduce((n, t) => n + t.bugs.length, 0)).toBe(12)
  for (const t of TASKS) {
    expect(t.isolate).toBe(true)
    expect(t.git).toBe(true)
    expect(t.setup).toEqual([])
    expect(t.patch).toBe(`src/features/review-triage/bench/task-fixture/patches/${t.id}.patch`)
    expect(t.allowedTools).toContain('mcp__jev-mod__review_triage')
    expect(t.allowedTools?.some(x => x === 'Edit' || x === 'Write')).toBe(false)
    expect(new Set([...t.bugs, ...t.tolerated].map(s => s.id)).size).toBe(t.bugs.length + t.tolerated.length)
  }
  // the prompt is what a person says, never names the tool, and asks for the line the checker reads
  expect(PROMPT).not.toMatch(/triage/i)
  expect(TELL).toContain('review_triage')
  expect(PROMPT).toContain('FINDING: <file>:<line>')
})

test('findings are read from FINDING lines in several shapes; none is nothing; a line without file:line is unreadable', () => {
  const text = [
    'Here is my review.',
    'FINDING: shop/pricing.py:21 - off by one',
    '**FINDING**: `shop/orders.py`:44 - sql built from text',
    'FINDING: ./shop/orders.py:50-53 - range',
    'FINDING: shop/pricing.py:21 - the same one again',
    'FINDING: the coupon logic is wrong somewhere',
    'FINDING: b/shop/api.py:3 - from a diff header',
  ].join('\n')
  const got = findingsOf(text)
  expect(got.found).toEqual([
    { file: 'shop/pricing.py', line: 21, end: 21 },
    { file: 'shop/orders.py', line: 44, end: 44 },
    { file: 'shop/orders.py', line: 50, end: 53 },
    { file: 'shop/api.py', line: 3, end: 3 },
  ])
  expect(got.unreadable).toBe(1)
  expect(findingsOf('FINDING: none')).toEqual({ found: [], unreadable: 0 })
  expect(findingsOf('No problems found.')).toEqual({ found: [], unreadable: 0 })
})

test('a needle is found by line, and a margin of two lines is allowed either side of a spot', () => {
  expect(linesWith('a\nb needle\nc\nneedle again', 'needle')).toEqual([2, 4])
  const bugs: Span[] = [{ id: 'x', file: 'shop/pricing.py', from: 20, to: 20 }]
  for (const line of [20 - MARGIN, 20, 20 + MARGIN]) expect(scoreFindings([{ file: 'shop/pricing.py', line, end: line }], 0, bugs, []).caught).toEqual(['x'])
  for (const line of [20 - MARGIN - 1, 20 + MARGIN + 1]) expect(scoreFindings([{ file: 'shop/pricing.py', line, end: line }], 0, bugs, []).false).toBe(1)
  // a range that reaches the spot counts
  expect(scoreFindings([{ file: 'shop/pricing.py', line: 10, end: 19 }], 0, bugs, []).caught).toEqual(['x'])
  // the wrong file at the right line does not
  expect(scoreFindings([{ file: 'shop/orders.py', line: 20, end: 20 }], 0, bugs, []).false).toBe(1)
})

test('scoring: catches, misses, tolerated findings charge nothing, false ones and unreadable lines cost precision', () => {
  const bugs: Span[] = [{ id: 'a', file: 'f.py', from: 10, to: 10 }, { id: 'b', file: 'f.py', from: 40, to: 42 }]
  const tolerated: Span[] = [{ id: 't', file: 'g.py', from: 5, to: 5 }]
  const all = scoreFindings([{ file: 'f.py', line: 10, end: 10 }, { file: 'f.py', line: 41, end: 41 }, { file: 'g.py', line: 5, end: 5 }], 0, bugs, tolerated)
  expect(all).toMatchObject({ caught: ['a', 'b'], missed: [], matched: 2, tolerated: 1, false: 0 })
  expect(checkedOf(all, 2)).toMatchObject({ success: true, score: 1 })
  // one bug found, one false finding, one unreadable: recall 1/2, precision 1/3
  const part = scoreFindings([{ file: 'f.py', line: 10, end: 10 }, { file: 'h.py', line: 1, end: 1 }], 1, bugs, tolerated)
  expect(part).toMatchObject({ caught: ['a'], missed: ['b'], false: 2 })
  const c = checkedOf(part, 2)
  expect(c.success).toBe(false)
  expect(Math.abs(c.score - 2 * 0.5 * (1 / 3) / (0.5 + 1 / 3))).toBeLessThan(1e-9)
  // two findings on one bug are one catch, both matched
  expect(scoreFindings([{ file: 'f.py', line: 9, end: 9 }, { file: 'f.py', line: 11, end: 11 }], 0, bugs, []).caught).toEqual(['a'])
  // a clean change: 1 with nothing reported, 0 with anything false
  expect(checkedOf(scoreFindings([], 0, [], []), 0)).toMatchObject({ success: true, score: 1 })
  expect(checkedOf(scoreFindings([{ file: 'f.py', line: 1, end: 1 }], 0, [], []), 0)).toMatchObject({ success: false, score: 0 })
  // all defects missed and nothing else said
  expect(checkedOf(scoreFindings([], 0, bugs, []), 2)).toMatchObject({ success: false, score: 0 })
})

test('arms: plain Claude Code has no triage tool, jev-mod has it on; the overlay differs only there', () => {
  const arms = armsFor(task, ['openrouter'], { name: 'minConfidence', values: [0.6, 0.8] }, {})
  expect(arms.map(a => a.id)).toEqual(['claude', 'jev-mod openrouter minConfidence=0.6', 'jev-mod openrouter minConfidence=0.8'])
  const plain = overlayFor(task, arms[0]!, '/l') as { features: Record<string, Record<string, unknown>> }
  const mod = overlayFor(task, arms[2]!, '/l') as { features: Record<string, Record<string, unknown>> }
  expect(plain.features['review-triage']).toEqual({ mode: 'off' })
  expect(mod.features['review-triage']).toEqual({ mode: 'on', minConfidence: 0.8 })
  const p = plan(task, task.cases(), arms)
  expect(p.claudeCalls).toBe(30)
  expect(Math.abs(p.armsUsd - task.cases().reduce((n, t) => n + 3 * stepUsd(t as never), 0))).toBeLessThan(1e-9)
})

test('a jev-mod arm is told to use the tool unless told=0; plain Claude Code never is; the overlay is the same either way', () => {
  const t = TASKS[3]!
  const arm = (kind: 'claude' | 'jev-mod', settings: Record<string, number | boolean>) => ({ id: 'a', kind, backend: kind === 'claude' ? null : 'openrouter', settings })
  expect(task.steps(t, arm('claude', {}))[0]!.prompt).toBe(PROMPT)
  expect(task.steps(t, arm('jev-mod', {}))[0]!.prompt).toBe(PROMPT + TELL)
  expect(task.steps(t, arm('jev-mod', { told: 1 }))[0]!.prompt).toBe(PROMPT + TELL)
  expect(task.steps(t, arm('jev-mod', { told: 0 }))[0]!.prompt).toBe(PROMPT)
  const arms = armsFor(task, ['openrouter'], { name: 'told', values: [0, 1] }, {})
  expect(arms.map(a => a.id)).toEqual(['claude', 'jev-mod openrouter told=0', 'jev-mod openrouter told=1'])
})

test('a jev-mod arm whose triage asked no decision model is an error, whatever other features asked', () => {
  const t = TASKS[3]!
  const mod = { id: 'jev-mod openrouter', kind: 'jev-mod' as const, backend: 'openrouter', settings: {} }
  const run = (n: number, other = 2) => ({ ledgerEntries: n + other, ledgerFeatures: { 'stop-gate': other, ...(n ? { 'review-triage': n } : {}) }, contextTokens: null, compaction: null })
  expect(verify(t, mod, run(0))).toBe('not_triaged')
  expect(verify(t, mod, run(2))).toBeNull()
  expect(verify(t, { id: 'claude', kind: 'claude', backend: null, settings: {} }, run(0))).toBeNull()
  const row = { outcome: 'ok', success: true, score: 1 } as Row
  verifyArms(task, t, [{ arm: mod, row, run: run(0) }])
  expect([row.outcome, row.error, row.score]).toEqual(['error', 'not_triaged', undefined])
})
