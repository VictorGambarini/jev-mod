import { test, expect } from 'claude-code/testing'
import { caseWanted, parseArgs, parseRepeat } from './args'

test('--repeat: a whole number of runs per case and arm, task level only; one when not given', () => {
  expect(parseArgs(['browser', '--level', 'task', '--backend', 'openrouter']).repeat).toBe(1)
  const a = parseArgs(['browser', '--level', 'task', '--backend', 'openrouter', '--repeat', '3', '--claude-arg', '--plugin-dir', '--claude-arg', '/w'])
  expect([a.repeat, a.level, a.backends, a.claudeArgs]).toEqual([3, 'task', ['openrouter'], ['--plugin-dir', '/w']])
  // the level may come after it
  expect(parseArgs(['browser', '--repeat', '2', '--backend', 'openrouter', '--level', 'task']).repeat).toBe(2)
  // one run is the default at either level
  expect(parseArgs(['browser', '--backend', 'fake', '--repeat', '1']).repeat).toBe(1)
  expect(() => parseArgs(['browser', '--backend', 'fake', '--repeat', '3'])).toThrow('task level')
  for (const bad of ['0', '-1', '2.5', 'three', '', '21']) expect(() => parseRepeat(bad), bad).toThrow('--repeat takes a whole number')
  expect(() => parseArgs(['browser', '--level', 'task', '--backend', 'openrouter', '--repeat'])).toThrow('--repeat needs a value')
})

test('the other options still parse as before', () => {
  const a = parseArgs(['compact', '--level', 'task', '--backend', 'typesafe,laya', '--sweep', 'drop=0.6:0.9:0.1', '--set', 'x=0.5', '--cases', 'a,b', '--yes'])
  expect(a).toMatchObject({ feature: 'compact', backends: ['typesafe', 'laya'], settings: { x: 0.5 }, cases: ['a', 'b'], yes: true, repeat: 1 })
  expect(a.sweep).toEqual({ name: 'drop', from: 0.6, to: 0.9, step: 0.1 })
  expect(() => parseArgs(['compact'])).toThrow('name a backend')
  expect(() => parseArgs(['compact', '--backend', 'fake', '--nope'])).toThrow('unknown option --nope')
})

test('--cases: ids, or a prefix ending in *; no filter takes every case', () => {
  expect(caseWanted(null, 'x')).toBe(true)
  expect(caseWanted(['a', 'saleor-*'], 'saleor-refund-callers')).toBe(true)
  expect(caseWanted(['a', 'saleor-*'], 'a')).toBe(true)
  expect(caseWanted(['a', 'saleor-*'], 'ab')).toBe(false)
  expect(caseWanted(['saleor-*'], 'webhook-retry')).toBe(false)
})
