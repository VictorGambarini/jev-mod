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

export type Plan = { cases: number; arms: number; claudeCalls: number; setupCalls: number; decisionCalls: number
  setupUsd: number; armsUsd: number; usd: number; text: string }

/**
 * The calls and their estimated cost. `usdPerCall`, when given (--usd-per-call), prices every
 * Claude call alike; otherwise each step's own `usd`, the case's setup price (or the adapter's per
 * setup call), or its usdPerCall. The adapter's estimate note says how it priced them.
 */
export function plan(adapter: TaskAdapter, cases: readonly TaskCase[], arms: readonly Arm[], usdPerCall: number | null = null,
  decisionUsdPerCall = 0.0005): Plan {
  let setupCalls = 0
  let armCalls = 0
  let decisionCalls = 0
  let setupUsd = 0
  let armsUsd = 0
  for (const c of cases) {
    setupCalls += c.setup.length
    setupUsd += usdPerCall !== null ? c.setup.length * usdPerCall : c.setupUsd ?? c.setup.length * (adapter.setupUsdPerCall ?? adapter.usdPerCall)
    for (const arm of arms) {
      for (const step of adapter.steps(c, arm)) {
        armCalls++
        armsUsd += usdPerCall ?? step.usd ?? adapter.usdPerCall
      }
      if (arm.kind === 'jev-mod') decisionCalls += adapter.decisionCallsPerArm
    }
  }
  const claudeCalls = setupCalls + armCalls
  const usd = setupUsd + armsUsd + decisionCalls * decisionUsdPerCall
  const priced = usdPerCall === null ? 'per step' : `~$${usdPerCall.toFixed(2)} a call`
  const text = [
    `${adapter.feature}, task level: ${cases.length} case(s) × ${arms.length} arm(s)`,
    ...arms.map(a => `  arm: ${a.id}`),
    `  ${claudeCalls} headless Claude calls: ${setupCalls} for the shared setup (once per case), ${armCalls} for the arms' steps`,
    `  about ${decisionCalls} decision-model calls`,
    `  estimate: about $${usd.toFixed(2)} in all: setup $${setupUsd.toFixed(2)}, arms $${armsUsd.toFixed(2)}, ` +
      `decisions $${(decisionCalls * decisionUsdPerCall).toFixed(2)} (Claude priced ${priced}; set --usd-per-call to change it)`,
    ...(usdPerCall === null ? adapter.estimateNote?.(cases) ?? [] : []),
  ].join('\n')
  return { cases: cases.length, arms: arms.length, claudeCalls, setupCalls, decisionCalls, setupUsd, armsUsd, usd, text }
}

/** Why the run may not start, or null: a task-level run spends real money, so it needs --yes. */
export function guard(p: Plan, yes: boolean): string | null {
  if (p.claudeCalls === 0) return 'nothing to run: no cases or no arms'
  if (!yes) return `${p.text}\n\nThis spends real money on Claude and the decision backend. Nothing was run. Rerun with --yes to start it.`
  return null
}

/**
 * The bench overlay's feature sections for an arm: every feature the overlay may switch off is off
 * (so a jev-mod arm runs the feature under test and as little else as it can), then the adapter's
 * own sections. Protective features (screening, the gates) stay as the person has them: an
 * overlay may only make them stricter. What they still ask is in the row's `by_feature`, apart
 * from the feature's own decisions. A plain arm runs with jev-mod off whole (task.ts), so this only
 * matters to it as a second guard.
 */
export function overlayFor(adapter: TaskAdapter, arm: Arm, ledger: string): Record<string, unknown> {
  const features: Record<string, Record<string, unknown>> = {}
  for (const f of FEATURES) if (!f.protective && f.id !== 'band' && f.modes.includes('off')) features[f.id] = { mode: 'off' }
  const own = adapter.overlay(arm)
  for (const [id, section] of Object.entries(own.features)) features[id] = { ...(features[id] ?? {}), ...section }
  return { features, ...(own.compact ? { compact: own.compact } : {}), ledger }
}
