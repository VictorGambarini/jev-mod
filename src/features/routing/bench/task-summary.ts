// Routing's task-level results by difficulty: where routing saves money and whether it loses
// accuracy on hard work. Pure: task-summary.test.ts. task-report.ts reads the rows and writes
// results/task-routing.md and results/task-routing.svg (the shared report draws the rest).

import { barPanels } from '../../../bench/svg'
import type { Row } from '../../../bench/types'
import { DIFFICULTIES, TASKS, type Difficulty } from './task-cases'

const difficultyOf = (id: string): Difficulty | null => TASKS.find(t => t.id === id)?.difficulty ?? null

export type Group = {
  difficulty: Difficulty | 'all'
  arm: string
  runs: number
  succeeded: number
  /** Arm runs that errored (no score): Claude failed, timed out or hit its budget. */
  errors: number
  claude_usd: number
  decision_usd: number
  wall_ms: number
  /** Claude's spend per model, summed over the group's runs. */
  models: Record<string, number>
}

/** One group per difficulty and arm, then each arm over every case; setup rows left out. */
export function groups(rows: readonly Row[]): Group[] {
  const out: Group[] = []
  const arms = [...new Set(rows.filter(r => r.level === 'task' && !r.setup && r.arm).map(r => r.arm!))]
  for (const d of [...DIFFICULTIES, 'all' as const]) {
    for (const arm of arms) {
      const mine = rows.filter(r => r.level === 'task' && !r.setup && r.arm === arm && (d === 'all' || difficultyOf(r.case) === d))
      if (!mine.length) continue
      const models: Record<string, number> = {}
      for (const r of mine) for (const [m, usd] of Object.entries(r.claude_models ?? {})) models[m] = (models[m] ?? 0) + usd
      out.push({ difficulty: d, arm, runs: mine.length, succeeded: mine.filter(r => r.success).length,
        errors: mine.filter(r => r.outcome === 'error').length,
        claude_usd: mine.reduce((n, r) => n + (r.claude_cost_usd ?? 0), 0), decision_usd: mine.reduce((n, r) => n + r.cost_usd, 0),
        wall_ms: mine.reduce((n, r) => n + (r.wall_ms ?? 0), 0), models })
    }
  }
  return out
}

/** "claude-haiku-4-5-20251001" -> "haiku"; the id as it is when it names no family. */
export const family = (model: string) => /haiku|sonnet|opus|fable/.exec(model)?.[0] ?? model

/** The models a group's spend went to, largest first, as shares: "opus 97%, haiku 3%". */
export function modelMix(models: Record<string, number>): string {
  const total = Object.values(models).reduce((n, v) => n + v, 0)
  if (total <= 0) return '—'
  const byFamily: Record<string, number> = {}
  for (const [m, usd] of Object.entries(models)) byFamily[family(m)] = (byFamily[family(m)] ?? 0) + usd
  return Object.entries(byFamily).sort((a, b) => b[1] - a[1]).map(([m, usd]) => `${m} ${Math.round((100 * usd) / total)}%`).join(', ')
}

const usd = (n: number) => `$${n.toFixed(n >= 1 || n === 0 ? 2 : n >= 0.01 ? 3 : 5)}`

/** The tables: per difficulty and arm, then per case. */
export function markdown(rows: readonly Row[], title: string): string {
  const g = groups(rows)
  const lines = [`### ${title}`, '',
    '| difficulty | arm | success | Claude $/task | decision $/task | total $/task | wall s/task | Claude spend by model |',
    '|---|---|---|---|---|---|---|---|']
  for (const x of g) {
    const per = (n: number) => n / x.runs
    lines.push(`| ${x.difficulty} | ${x.arm} | ${x.succeeded}/${x.runs}${x.errors ? ` (${x.errors} error${x.errors > 1 ? 's' : ''})` : ''} | ` +
      `${usd(per(x.claude_usd))} | ${usd(per(x.decision_usd))} | ${usd(per(x.claude_usd + x.decision_usd))} | ` +
      `${(per(x.wall_ms) / 1000).toFixed(0)} | ${modelMix(x.models)} |`)
  }
  lines.push('', '| case | difficulty | arm | success | score | Claude $ | decision $ | wall s | models |', '|---|---|---|---|---|---|---|---|---|')
  for (const r of rows.filter(r => r.level === 'task' && !r.setup)) {
    lines.push(`| ${r.case} | ${difficultyOf(r.case) ?? '?'} | ${r.arm} | ${r.outcome === 'error' ? `error (${r.error})` : r.success ? 'yes' : 'no'} | ` +
      `${r.score === undefined ? '—' : r.score.toFixed(2)} | ${usd(r.claude_cost_usd ?? 0)} | ${usd(r.cost_usd)} | ` +
      `${((r.wall_ms ?? 0) / 1000).toFixed(0)} | ${Object.keys(r.claude_models ?? {}).map(family).join(', ') || '—'} |`)
  }
  return lines.join('\n') + '\n'
}

/** Success, total cost and wall time per task, each difficulty's arms side by side. */
export function plot(rows: readonly Row[], fake: boolean): string {
  const g = groups(rows)
  const label = (x: Group) => `${x.difficulty} · ${x.arm}`
  return barPanels({
    title: `routing, task level: plain Claude Code beside routing, by difficulty${fake ? ' (FAKE)' : ''}`,
    subtitle: 'success share; Claude + decision $ per task; wall seconds per task',
    fake,
    panels: [
      { title: 'success', rows: g.map(x => ({ label: label(x), value: x.succeeded / x.runs })), format: n => `${Math.round(n * 100)}%` },
      { title: 'total $ / task', rows: g.map(x => ({ label: label(x), value: (x.claude_usd + x.decision_usd) / x.runs })), format: n => `$${n.toFixed(2)}` },
      { title: 'wall s / task', rows: g.map(x => ({ label: label(x), value: x.wall_ms / x.runs / 1000 })), format: n => `${n.toFixed(0)} s` },
    ],
  })
}
