import { test, expect } from 'claude-code/testing'
import { fakeHostFor, runDecision } from '../../../bench/decision'
import type { Row } from '../../../bench/types'
import { ALWAYS_KEEP_LAST, unitsOf } from '../keep'
import { adapter, keptAt } from './adapter'
import { SESSIONS } from './cases'
import { checkAnswers, questionPrompt, TASKS } from './task'

const meta = { schema: 1 as const, run: 'r', feature: 'compact', level: 'decision' as const, jevmod: '0.10.0', git: 'abc', date: 'd', settings: {}, sweep: null }

async function fakeRows(): Promise<Row[]> {
  return runDecision({ adapter, backend: { name: 'fake', kind: 'fake', model: 'fake-jev' }, hostFor: fakeHostFor(adapter), meta, timeoutMs: 8000, settings: {} })
}

test('the sessions are long enough to compact, labelled throughout, with both labels outside the kept tail', () => {
  expect(SESSIONS.length).toBe(10)
  for (const s of SESSIONS) {
    expect(s.messages.length).toBeGreaterThan(ALWAYS_KEEP_LAST + 8)
    const scored = s.messages.slice(0, -ALWAYS_KEEP_LAST)
    expect(scored.some(m => m.gold === 'drop')).toBe(true)
    expect(scored.some(m => m.gold === 'keep')).toBe(true)
    expect(unitsOf(s.messages).units.length).toBeGreaterThan(4)
  }
  expect(new Set(SESSIONS.map(s => s.id)).size).toBe(SESSIONS.length)
})

test('on the fake backend every session is judged, each unit once, and nothing secret is kept in the row', async () => {
  const rows = await fakeRows()
  expect(rows.map(r => r.outcome)).toEqual(SESSIONS.map(() => 'ok'))
  for (const [i, r] of rows.entries()) {
    const units = unitsOf(SESSIONS[i]!.messages).units
    expect(r.items).toHaveLength(units.length)
    expect(r.fake).toBe(true)
    expect(r.calls).toBeGreaterThanOrEqual(1)
    // the stored skeleton holds no message text
    expect(JSON.stringify(r.detail)).not.toContain(SESSIONS[i]!.messages[0]!.text.slice(0, 20))
  }
})

test('the sweep is monotone: a higher bar never drops more, and at 1.01 nothing goes', async () => {
  const rows = await fakeRows()
  let last = Infinity
  for (const t of [0, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 1.01]) {
    const m = adapter.evaluate(rows, t)
    expect(m.effect).toBeLessThanOrEqual(last)
    last = m.effect
  }
  expect(adapter.evaluate(rows, 1.01).effect).toBe(0)
  expect(adapter.evaluate(rows, 1.01).extra['keep lost']).toBe(0)
  // the fake leans right, so a bar of 0.5 drops some messages labelled drop
  expect(adapter.evaluate(rows, 0.5).tp).toBeGreaterThan(0)
})

test('a message goes only when all its units reach the bar; a judged keep or an unjudged unit keeps it', () => {
  // m0 text, m1 text, m2+m3 a tool pair, then the 6-message tail
  const skeleton = [
    { i: 0, role: 'user', text: 'x' }, { i: 1, role: 'assistant', text: 'x' },
    { i: 2, role: 'assistant', text: '', toolUses: [{ tool_use_id: 'a' }] }, { i: 3, role: 'user', text: '', toolResults: [{ tool_use_id: 'a' }] },
    ...[4, 5, 6, 7, 8, 9].map(i => ({ i, role: 'user', text: 'x' })),
  ]
  const units = [{ text: 0 }, { text: 1 }, { pair: 'a' }]
  const d = { skeleton, gold: [], units, scores: [0.9, -1, 0.75] }
  expect([...keptAt(d as never, 0.8)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  expect([...keptAt(d as never, 0.7)].sort((a, b) => a - b)).toEqual([1, 4, 5, 6, 7, 8, 9])
  expect([...keptAt({ ...d, scores: [0.9, null, null] } as never, 0.5)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
})

test('the fake is told the gold label of each unit it is asked about', () => {
  const s = SESSIONS[0]!
  const { units } = unitsOf(s.messages)
  units.forEach((u, j) => {
    const truth = adapter.truth(s, {}, `t${j}`)
    if ('text' in u) expect(truth).toBe(s.messages[u.text]!.gold)
    else expect(['keep', 'drop']).toContain(truth)
  })
})

// What a model that kept everything would answer, per case: each must score 1.
const GOLD: Record<string, string[]> = {
  briefing: ['Mereana Tait', '14 March', 'HP-4471-Z', '$250', 'Priya', 'Release 2.3', 'nightly-reprice', 'Tomasz'],
  'file-values': ['8157', '1800 ms', 'growth', '5', 'Aroha Ngata', '312', '600 ms', 'Sione Fifita'],
  'decisions-and-rules': ['SQLite', 'We deploy to a single host', 'config.json', 'cents', '7', 'legacy_tax', 'm8', '100 cents'],
}

test('task level: every case has its gold answers, and they score 1', () => {
  expect(TASKS.map(t => t.id).sort()).toEqual(Object.keys(GOLD).sort())
  for (const t of TASKS) {
    expect(questionPrompt(t)).toContain(`${t.questions.length}. ${t.questions[t.questions.length - 1]!.q}`)
    const gold = GOLD[t.id]!
    expect(gold.length).toBe(t.questions.length)
    expect(checkAnswers(t, gold.map((a, i) => `${i + 1}. ${a}`).join('\n'))).toEqual({ success: true, score: 1, detail: { right: gold.map(() => true) } })
  }
})

test('task level: the checker scores numbered answers, never the number itself, and a lossy answer scores below 1', () => {
  const t = TASKS.find(c => c.id === 'decisions-and-rules')!
  // a summary that kept the gist: the old plan, no reason, no counts
  const lossy = checkAnswers(t, 'Here you go:\n1. Redis, then SQLite\n2. unknown\n**3.** config.json\n4. cents\n5. unknown\n6. legacy_tax\n7. unknown\n8. 100')
  expect(lossy.success).toBe(false)
  expect(lossy.score).toBe(0.5)
  // "5." is the line's number, not the answer: the warnings count is 7
  expect(checkAnswers(t, '5. unknown').detail).toEqual({ right: [false, false, false, false, false, false, false, false] })
  expect(checkAnswers(t, '').score).toBe(0)
})
