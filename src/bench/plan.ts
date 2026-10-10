// The task level's plan: which arms run, how many Claude calls that makes, about what it costs,
// and the guard that refuses to start without --yes. Pure; plan.test.ts.

import { FEATURES } from '../core/registry'
import type { Arm, Setting, TaskAdapter, TaskCase } from './types'

/** The arms: plain Claude Code (the feature off), any the adapter adds, then the feature on for each backend × swept value. */
export function armsFor(adapter: TaskAdapter, backends: readonly string[], swept: { name: string; values: readonly number[] } | null,
  settings: Record<string, Setting>): Arm[] {
  const arms: Arm[] = [{ id: 'claude', kind: 'claude', backend: null, settings: {} }, ...(adapter.extraArms?.() ?? [])]
  for (const backend of backends) {
    for (const value of swept ? swept.values : [null]) {
      const mine = { ...settings, ...(swept && value !== null ? { [swept.name]: value } : {}) }
      const tag = Object.entries(mine).map(([k, v]) => `${k}=${v}`).join(' ')
      arms.push({ id: `jev-mod ${backend}${tag ? ` ${tag}` : ''}`, kind: 'jev-mod', backend, settings: mine })
    }
  }
  return arms
}

export type Plan = { cases: number; arms: number; claudeCalls: number; decisionCalls: number; usd: number; text: string }

export function plan(adapter: TaskAdapter, cases: readonly TaskCase[], arms: readonly Arm[], usdPerCall = adapter.usdPerCall,
  decisionUsdPerCall = 0.0005): Plan {
  let claudeCalls = 0
  let decisionCalls = 0
  for (const c of cases) {
    claudeCalls += c.setup.length
    for (const arm of arms) {
      claudeCalls += adapter.steps(c, arm).length
      if (arm.kind === 'jev-mod') decisionCalls += adapter.decisionCallsPerArm
    }
  }
  const usd = claudeCalls * usdPerCall + decisionCalls * decisionUsdPerCall
  const text = [
    `${adapter.feature}, task level: ${cases.length} case(s) × ${arms.length} arm(s)`,
    ...arms.map(a => `  arm: ${a.id}`),
    `  ${claudeCalls} headless Claude calls (shared setup once per case, then each arm's steps)`,
    `  about ${decisionCalls} decision-model calls`,
    `  estimate: about $${usd.toFixed(2)} (Claude at ~$${usdPerCall.toFixed(2)} a call; set --usd-per-call to change it)`,
  ].join('\n')
  return { cases: cases.length, arms: arms.length, claudeCalls, decisionCalls, usd, text }
}

/** Why the run may not start, or null: a task-level run spends real money, so it needs --yes. */
export function guard(p: Plan, yes: boolean): string | null {
  if (p.claudeCalls === 0) return 'nothing to run: no cases or no arms'
  if (!yes) return `${p.text}\n\nThis spends real money on Claude and the decision backend. Nothing was run. Rerun with --yes to start it.`
  return null
}

/**
 * The bench overlay's feature sections for an arm: every feature that changes what the model
 * sees is off (so arms differ only in the one under test), then the adapter's own sections.
 * Protective features (screening, the gates) are left as the person has them: an overlay may
 * not loosen them, so they are the same in every arm.
 */
export function overlayFor(adapter: TaskAdapter, arm: Arm, ledger: string): Record<string, unknown> {
  const features: Record<string, Record<string, unknown>> = {}
  for (const f of FEATURES) if (!f.protective && !f.risky && f.id !== 'band' && f.modes.includes('off')) features[f.id] = { mode: 'off' }
  const own = adapter.overlay(arm)
  for (const [id, section] of Object.entries(own.features)) features[id] = { ...(features[id] ?? {}), ...section }
  return { features, ...(own.compact ? { compact: own.compact } : {}), ledger }
}
