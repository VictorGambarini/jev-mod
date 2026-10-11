import { test, expect } from 'claude-code/testing'
import { task as compactTask, TASKS } from '../features/compact/bench/task'
import { FEATURES } from '../core/registry'
import { parseOverlay } from '../core/bench-overlay'
import { armsFor, guard, overlayFor, plan } from './plan'

test('arms: plain Claude Code, the adapter\'s own, then each backend at each swept value', () => {
  const arms = armsFor(compactTask, ['typesafe', 'laya'], { name: 'drop', values: [0.6, 0.8] }, {})
  expect(arms.map(a => a.id)).toEqual(['claude', 'no compaction', 'jev-mod typesafe drop=0.6', 'jev-mod typesafe drop=0.8',
    'jev-mod laya drop=0.6', 'jev-mod laya drop=0.8'])
  expect(arms[3]).toEqual({ id: 'jev-mod typesafe drop=0.8', kind: 'jev-mod', backend: 'typesafe', settings: { drop: 0.8 } })
})

test('the plan counts every Claude call: shared setup once per case, then each arm\'s steps', () => {
  const arms = armsFor(compactTask, ['typesafe'], { name: 'drop', values: [0.6, 0.7, 0.8] }, {})
  const p = plan(compactTask, TASKS, arms, 0.1)
  const setup = TASKS.reduce((n, t) => n + t.setup.length, 0)
  // per case: claude (2 steps), no compaction (1), three jev-mod arms (2 each)
  expect(p.claudeCalls).toBe(setup + TASKS.length * (2 + 1 + 3 * 2))
  expect(p.decisionCalls).toBe(TASKS.length * 3 * compactTask.decisionCallsPerArm)
  expect(Math.round(p.usd * 100) / 100).toBe(Math.round((p.claudeCalls * 0.1 + p.decisionCalls * 0.0005) * 100) / 100)
  expect(p.text).toContain(`${p.claudeCalls} headless Claude calls`)
})

test('without --usd-per-call each step is priced on its own, and the estimate includes the shared setup', () => {
  const arms = armsFor(compactTask, ['openrouter'], { name: 'drop', values: [0.6, 0.7, 0.8, 0.9] }, {})
  const p = plan(compactTask, TASKS, arms)
  const setupCalls = TASKS.reduce((n, t) => n + t.setup.length, 0)
  expect(p.setupCalls).toBe(setupCalls)
  expect(Math.round(p.setupUsd * 1e6)).toBe(Math.round(setupCalls * compactTask.setupUsdPerCall! * 1e6))
  // per case: /compact then the question; the question alone; each jev-mod arm's own compaction then the question
  expect(Math.round(p.armsUsd * 1e6)).toBe(Math.round(TASKS.length * ((0.7 + 0.5) + 0.5 + 4 * (0.02 + 0.5)) * 1e6))
  expect(Math.round(p.usd * 1e6)).toBe(Math.round((p.setupUsd + p.armsUsd + p.decisionCalls * 0.0005) * 1e6))
  expect(p.text).toContain(`setup $${p.setupUsd.toFixed(2)}`)
  expect(p.text).toContain('priced per step')
})

test('without --yes nothing runs: the guard returns the plan and says how to start it', () => {
  const p = plan(compactTask, TASKS, armsFor(compactTask, ['typesafe'], null, {}))
  const refused = guard(p, false)
  expect(refused).toContain('Nothing was run')
  expect(refused).toContain('--yes')
  expect(refused).toContain('estimate: about $')
  expect(guard(p, true)).toBe(null)
  expect(guard(plan(compactTask, [], []), true)).toContain('nothing to run')
})

test('an arm\'s overlay turns the other plain features off, leaves protective ones alone, and carries no key', () => {
  const [, , on] = armsFor(compactTask, ['typesafe'], { name: 'drop', values: [0.85] }, {})
  const overlay = overlayFor(compactTask, on!, '/scratch/ledger') as { features: Record<string, { mode: string }>; compact?: { dropConfidence: number }; ledger: string }
  expect(overlay.compact).toEqual({ dropConfidence: 0.85 })
  expect(overlay.ledger).toBe('/scratch/ledger')
  for (const f of FEATURES) {
    if (f.protective || f.risky) expect(overlay.features[f.id]).toBe(undefined)
  }
  expect(overlay.features.routing).toEqual({ mode: 'off' })
  expect(overlay.features['trim-output']).toEqual({ mode: 'off' })
  // what the mod reads back is the same overlay: nothing in it looks like a key
  expect('overlay' in parseOverlay(JSON.stringify(overlay))).toBe(true)
  // the plain Claude Code arm sets no drop confidence
  expect((overlayFor(compactTask, { id: 'claude', kind: 'claude', backend: null, settings: {} }, '/l') as { compact?: unknown }).compact).toBe(undefined)
})
