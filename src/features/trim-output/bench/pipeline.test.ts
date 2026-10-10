import { test, expect } from 'claude-code/testing'
import { CASES } from './cases'
import { fakeDecide, goalWords, keepFailuresOnly, table, withDecisionModel, type Decide } from './pipeline'

test('the fixtures are test logs long enough to be trimmed, each with gold lines that are in the log', () => {
  expect(CASES.map(c => c.name)).toEqual(['vitest', 'jest', 'pytest', 'go test'])
  for (const c of CASES) {
    const lines = new Set(c.log.split('\n').map(l => l.trim()))
    expect(c.log.split('\n').length).toBeGreaterThan(150)
    expect(c.gold.length).toBeGreaterThan(5)
    for (const g of c.gold) expect(lines.has(g.trim())).toBe(true)
  }
})

test('keep failures only cuts most of a log and loses the gold lines the goal was about', () => {
  const results = CASES.map(keepFailuresOnly)
  for (const r of results) {
    expect(r.cutPercent).toBeGreaterThanOrEqual(85)
    expect(r.goldLost.length).toBeGreaterThan(0)
  }
  expect(results.reduce((n, r) => n + r.goldLost.length, 0)).toBe(26)
})

test('the decision-model path, on a fake backend, cuts a good part of each log and loses no gold line', async () => {
  const results = await Promise.all(CASES.map(c => withDecisionModel(c, fakeDecide)))
  for (const r of results) {
    expect(r.cutPercent).toBeGreaterThanOrEqual(55)
    expect(r.goldLost).toEqual([])
    expect(r.requests).toBe(1) // one request per log
    expect(r.asked).toBeGreaterThan(0)
  }
  console.log(table('keep failures only', CASES.map(keepFailuresOnly)))
  console.log(table('decision model (fake backend)', results))
})

test('a backend that says "needed" for everything cuts nothing; one that is unsure drops nothing', async () => {
  const all: Decide = async (_s, qs) => Object.fromEntries(Object.keys(qs).map(q => [q, 1]))
  const unsure: Decide = async (_s, qs) => Object.fromEntries(Object.keys(qs).map(q => [q, 0.2])) // not needed 0.8
  for (const decide of [all, unsure]) {
    const r = await withDecisionModel(CASES[0]!, decide)
    expect(r.goldLost).toEqual([])
    expect(r.cutPercent).toBeLessThan(25) // only what folding alone saves
  }
})

test('the fake reads the goal, not the command alone', () => {
  expect(goalWords('fix the failing parser test', 'npx vitest run')).toEqual(['parser', 'npx', 'vitest'].filter(w => w.length >= 5))
})
