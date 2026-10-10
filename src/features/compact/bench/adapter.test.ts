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

test('task level: the question prompt numbers each question, and the checker scores numbered answers', () => {
  const t = TASKS[0]!
  expect(questionPrompt(t)).toContain(`${t.questions.length}. ${t.questions[t.questions.length - 1]!.q}`)
  const right = checkAnswers(t, '1. config.json\n2. cents\n3. 7 warnings\n4. legacy_tax')
  expect(right).toEqual({ success: true, score: 1, detail: { right: [true, true, true, true] } })
  const half = checkAnswers(t, 'Here you go:\n1. config.json\n2. dollars\n3. unknown\n**4.** legacy_tax')
  expect(half.success).toBe(false)
  expect(half.score).toBe(0.5)
  expect(checkAnswers(t, '').score).toBe(0)
})
