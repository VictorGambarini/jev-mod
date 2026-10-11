import { test, expect } from 'claude-code/testing'
import { armsFor, overlayFor, plan } from '../../../bench/plan'
import { answersOf, LINE_SLACK, promptOf, score, task, TASKS, USD } from './task'

// The pure parts of the task bench. The fixture on disk and the whole runner (with a stand-in `claude`)
// are checked by `bun src/features/find-files/bench/task-check.ts`: tests here have no file system.

const byId = (id: string) => TASKS.find(t => t.id === id)!
const pathOf = (path: string, line: number | null = null) => ({ path, line })

test('ten tasks, ids unique, nothing set up, every gold file named, line questions have a line and the pattern it matches', () => {
  expect(TASKS.length).toBe(10)
  expect(new Set(TASKS.map(t => t.id)).size).toBe(TASKS.length)
  expect(TASKS.some(t => t.gold.length > 1)).toBe(true)
  for (const t of TASKS) {
    expect(t.setup).toEqual([])
    expect(t.git).toBe(true)
    expect(t.gold.length).toBeGreaterThan(0)
    expect(new Set(t.gold.map(g => g.path)).size).toBe(t.gold.length)
    for (const g of t.gold) {
      expect(g.path).toMatch(/^[\w./-]+\.\w+$/)
      if (t.format === 'lines') { expect(g.line).toBeGreaterThan(0); expect(g.needle).toBeInstanceOf(RegExp) }
      else expect(g.line).toBeUndefined()
    }
  }
  expect(TASKS.filter(t => t.format === 'lines').map(t => t.id)).toEqual(['tax-rate-env', 'refund-callers', 'dunning-cron'])
})

test('the prompt states the format, forbids edits and never names the tool', () => {
  for (const t of TASKS) {
    const p = promptOf(t)
    expect(p).toContain(t.ask)
    expect(p).toContain('ANSWERS')
    expect(p).toContain('do not change any files')
    expect(p.toLowerCase()).not.toContain('find_files')
  }
  expect(promptOf(byId('tax-rate-env'))).toContain('`path:line`')
  expect(promptOf(byId('invoice-pdf'))).not.toContain('path:line')
})

test('answers are read from the block after ANSWERS, whatever the bullets, ticks and absolute prefixes', () => {
  const text = 'I looked at src/other.ts first.\n\nANSWERS\n- `src/a.ts:12`\n2. **src/b/c.ts** (line 40)\n/tmp/x/project/src/d.ts#L7\n./src/e.ts\nnot a path\n'
  expect(answersOf(text, '/tmp/x/project')).toEqual([pathOf('src/a.ts', 12), pathOf('src/b/c.ts', 40), pathOf('src/d.ts', 7), pathOf('src/e.ts')])
  // no ANSWERS line: every line that starts like a path
  expect(answersOf('src/a.ts\nthe file is above\nsrc/b.ts:3')).toEqual([pathOf('src/a.ts'), pathOf('src/b.ts', 3)])
  expect(answersOf('ANSWERS\n')).toEqual([])
})

test('scores are precision and recall of the answers; success is all found and nothing else', () => {
  const t = byId('customers-export')
  const [a, b] = t.gold.map(g => pathOf(g.path))
  expect(score(t, [a!, b!])).toMatchObject({ success: true, score: 1 })
  const one = score(t, [a!])
  expect([one.success, one.detail!.recall, one.detail!.precision]).toEqual([false, 0.5, 1])
  const extra = score(t, [a!, b!, pathOf('src/lib/csv/write-csv.ts')])
  expect([extra.success, extra.detail!.precision, extra.detail!.wrong]).toEqual([false, 2 / 3, ['src/lib/csv/write-csv.ts']])
  expect(score(t, [])).toMatchObject({ success: false, score: 0 })
  // the same path twice counts once, and a line on a path question is ignored
  expect(score(t, [a!, a!, pathOf(b!.path, 40)]).success).toBe(true)
  // a directory or a file that is not gold is wrong
  expect(score(t, [pathOf('src/customers')]).detail!.answered).toBe(1)
})

test(`a line answer must be on the gold line, give or take ${LINE_SLACK}; a path without a line is not enough`, () => {
  const t = byId('dunning-cron')
  const { path, line } = t.gold[0]!
  for (const [at, ok] of [[line!, true], [line! + LINE_SLACK, true], [line! - LINE_SLACK, true], [line! + LINE_SLACK + 1, false], [null, false]] as const) {
    expect(score(t, [pathOf(path, at)]).success).toBe(ok)
  }
  // the import line of a caller is not the call
  const calls = byId('refund-callers')
  expect(score(calls, [pathOf(calls.gold[0]!.path, 3)]).detail!.recall).toBe(0)
  // all three call sites, each on its line, and nothing else
  expect(score(calls, calls.gold.map(g => pathOf(g.path, g.line!))).success).toBe(true)
  // the definition listed as well makes the answer wrong
  expect(score(calls, [...calls.gold.map(g => pathOf(g.path, g.line!)), pathOf('src/payments/refunds.ts', 10)])).toMatchObject({ success: false })
})

test('arms: plain Claude Code and find-files on; the overlay turns it on only for the second, and other features stay off', () => {
  const arms = armsFor(task, ['openrouter'], null, {})
  expect(arms.map(a => a.id)).toEqual(['claude', 'jev-mod openrouter'])
  const plain = overlayFor(task, arms[0]!, '/l') as { features: Record<string, { mode: string }> }
  const jev = overlayFor(task, arms[1]!, '/l') as { features: Record<string, { mode: string }> }
  expect(plain.features['find-files']?.mode).toBe('off')
  expect(jev.features['find-files']).toEqual({ mode: 'on' })
  expect(jev.features['routing']?.mode).toBe('off')
  const knobbed = overlayFor(task, { ...arms[1]!, settings: { limit: 5, maxCandidates: 40 } }, '/l') as { features: Record<string, unknown> }
  expect(knobbed.features['find-files']).toEqual({ mode: 'on', limit: 5, maxCandidates: 40 })
})

test('the plan: no setup, one call per case and arm, priced per arm; edits are refused in every step', () => {
  const arms = armsFor(task, ['openrouter'], null, {})
  const p = plan(task, TASKS, arms)
  expect([p.setupCalls, p.claudeCalls, p.decisionCalls]).toEqual([0, 20, 10 * task.decisionCallsPerArm])
  expect(Math.round(p.armsUsd * 100)).toBe(Math.round(10 * (USD.plain + USD.jev) * 100))
  expect(p.text).toContain('no shared setup')
  for (const t of TASKS) for (const arm of arms) {
    const [step] = task.steps(t, arm)
    expect(step!.final).toBe(true)
    expect(step!.disallowedTools).toEqual(expect.arrayContaining(['Edit', 'Write']))
  }
  expect(TASKS[0]!.allowedTools).toContain('mcp__jev-mod__find_files')
})
