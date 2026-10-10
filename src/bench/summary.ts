// What a report says about one feature's results: per backend, the metrics at each threshold of
// the sweep, the recommended threshold, cost and latency; per arm of a task-level run, success,
// time and cost. It returns the plots (SVG text), a Markdown block for the feature's README, and
// the suggested settings; report.ts writes them. Pure; summary.test.ts.

import { mean, percentile, recommend, thresholds } from './metrics'
import { barPanels, lineChart } from './svg'
import type { DecisionAdapter, Metrics, Row } from './types'

export const START = '<!-- bench:start -->'
export const END = '<!-- bench:end -->'

/** The README with `block` between the bench markers, or null when it has no markers (it is then left alone). */
export function insertBetweenMarkers(readme: string, block: string): string | null {
  const a = readme.indexOf(START)
  const b = readme.indexOf(END, a + START.length)
  if (a < 0 || b < 0) return null
  return `${readme.slice(0, a + START.length)}\n${block.trim()}\n${readme.slice(b)}`
}

export type Point = { threshold: number; metrics: Metrics }
export type BackendSummary = {
  key: string
  backend: string
  model: string | null
  rows: number
  errors: number
  points: Point[]
  recommended: { threshold: number; accuracy: number } | null
  atDefault: Metrics | null
  p50: number | null
  p95: number | null
  costPerCase: number | null
  callsPerCase: number | null
  tokensPerCase: number | null
}
export type ArmSummary = {
  key: string
  arm: string
  backend: string | null
  runs: number
  success: number | null
  score: number | null
  wallMs: number | null
  claudeCost: number | null
  decisionCost: number | null
  tokens: number | null
}

export type Summary = {
  feature: string
  fake: boolean
  sweep: number[]
  backends: BackendSummary[]
  baselines: { name: string; metrics: Metrics }[]
  arms: ArmSummary[]
  versions: string[]
}

const keyOf = (r: Row) => `${r.backend.name}${r.answered_model || r.backend.model ? ` · ${r.answered_model ?? r.backend.model}` : ''}`

/** The recommended point: the objective's peak (accuracy unless the adapter says), ties to the safer side. */
function best(adapter: DecisionAdapter, points: readonly Point[]): { threshold: number; accuracy: number } | null {
  const score = adapter.objective?.score ?? ((m: Metrics) => m.accuracy)
  const pick = recommend(points.map(p => ({ threshold: p.threshold, accuracy: score(p.metrics) })), adapter.threshold.safer, 1e-3)
  if (!pick) return null
  return { threshold: pick.threshold, accuracy: points.find(p => p.threshold === pick.threshold)!.metrics.accuracy }
}

/** The thresholds to draw: the run's own sweep when it named this threshold, else the adapter's. */
export function sweepFor(adapter: DecisionAdapter, rows: readonly Row[]): number[] {
  const asked = rows.map(r => r.sweep).find(s => s && s.startsWith(`${adapter.threshold.name}=`))
  if (asked) {
    const [from, to, step] = asked.split('=')[1]!.split(':').map(Number)
    if ([from, to, step].every(n => Number.isFinite(n)) && step! > 0) return thresholds({ from: from!, to: to!, step: step! })
  }
  return thresholds(adapter.threshold)
}

function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    out.set(k, [...(out.get(k) ?? []), item])
  }
  return out
}

export function summarise(adapter: DecisionAdapter, rows: readonly Row[], fake: boolean): Summary {
  const decision = rows.filter(r => r.level === 'decision' && r.feature === adapter.feature)
  const sweep = sweepFor(adapter, decision)
  const backends: BackendSummary[] = []
  for (const [key, mine] of groupBy(decision.filter(r => r.backend.kind !== 'baseline'), keyOf)) {
    const ok = mine.filter(r => r.outcome === 'ok')
    const points = sweep.map(threshold => ({ threshold, metrics: adapter.evaluate(mine, threshold) }))
    const latencies = ok.flatMap(r => r.latencies_ms)
    const tokens = ok.map(r => r.input_tokens).filter((n): n is number => n !== null)
    backends.push({
      key, backend: mine[0]!.backend.name, model: mine[0]!.answered_model ?? mine[0]!.backend.model,
      rows: mine.length, errors: mine.length - ok.length, points,
      recommended: ok.length ? best(adapter, points) : null,
      atDefault: ok.length ? adapter.evaluate(mine, adapter.threshold.default) : null,
      p50: percentile(latencies, 50), p95: percentile(latencies, 95),
      costPerCase: mean(ok.map(r => r.cost_usd)), callsPerCase: mean(ok.map(r => r.calls)), tokensPerCase: mean(tokens),
    })
  }
  const baselines = [...groupBy(decision.filter(r => r.backend.kind === 'baseline'), r => r.backend.name)]
    .map(([name, mine]) => ({ name, metrics: adapter.evaluate(mine, adapter.threshold.default) }))
  const task = rows.filter(r => r.level === 'task' && r.feature === adapter.feature)
  // an arm's id already names its backend and settings
  const arms: ArmSummary[] = [...groupBy(task, r => r.arm ?? '?')]
    .map(([key, mine]) => {
      const ok = mine.filter(r => r.outcome === 'ok')
      const num = (f: (r: Row) => number | undefined) => mean(ok.map(f).filter((n): n is number => typeof n === 'number'))
      return {
        key, arm: mine[0]!.arm ?? '?', backend: mine[0]!.backend.kind === 'baseline' ? null : mine[0]!.backend.name, runs: mine.length,
        success: num(r => (r.success === undefined ? undefined : r.success ? 1 : 0)), score: num(r => r.score),
        wallMs: num(r => r.wall_ms), claudeCost: num(r => r.claude_cost_usd), decisionCost: num(r => r.cost_usd),
        tokens: num(r => (r.claude_tokens ? r.claude_tokens.input + r.claude_tokens.output + r.claude_tokens.cache_read + r.claude_tokens.cache_write : undefined)),
      }
    })
  const versions = [...new Set(rows.map(r => `${r.jevmod}@${r.git.slice(0, 7)}`))]
  return { feature: adapter.feature, fake, sweep, backends, baselines, arms, versions }
}

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${(n * 100).toFixed(1)}%`)
const usd = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n === 0 ? '$0' : n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(3)}`)
const ms = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n >= 10_000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`)

/** The SVG plots, by file stem (`accuracy`, `effect`, `cost-latency`, `task`), only those with data. */
export function plots(adapter: DecisionAdapter, s: Summary): Record<string, string> {
  const out: Record<string, string> = {}
  const fake = s.fake
  const tag = fake ? ' (FAKE)' : ''
  const guides = [{ x: adapter.threshold.default, label: `today ${adapter.threshold.default}` }]
  if (s.backends.length) {
    out.accuracy = lineChart({
      title: `${adapter.title}: accuracy against ${adapter.threshold.name}${tag}`,
      subtitle: `ringed: recommended per backend (${adapter.objective ? adapter.objective.label : 'peak accuracy'}; ties go ${adapter.threshold.safer})`,
      xLabel: `${adapter.threshold.name} threshold`, yLabel: 'accuracy', percent: true, yMin: 0, yMax: 1, fake, guides,
      series: s.backends.map(b => ({ name: b.key, mark: b.recommended?.threshold, points: b.points.map(p => ({ x: p.threshold, y: p.metrics.cases ? p.metrics.accuracy : null })) })),
    })
    out.effect = lineChart({
      title: `${adapter.title}: ${adapter.effect} against ${adapter.threshold.name}${tag}`,
      xLabel: `${adapter.threshold.name} threshold`, yLabel: adapter.effect, percent: true, yMin: 0, fake, guides,
      series: s.backends.map(b => ({ name: b.key, points: b.points.map(p => ({ x: p.threshold, y: p.metrics.cases ? p.metrics.effect : null })) })),
    })
    out['cost-latency'] = barPanels({
      title: `${adapter.title}: decision cost and latency per backend${tag}`, fake,
      subtitle: 'latency per decision call; cost per case as the client bills it (a named backend bills $0 here)',
      panels: [
        { title: 'latency p50', format: ms, rows: s.backends.map(b => ({ label: b.key, value: b.p50 })) },
        { title: 'latency p95', format: ms, rows: s.backends.map(b => ({ label: b.key, value: b.p95 })) },
        { title: 'cost per case', format: usd, rows: s.backends.map(b => ({ label: b.key, value: b.costPerCase })) },
      ],
    })
  }
  if (s.arms.length) {
    out.task = barPanels({
      title: `${adapter.title}: jev-mod against plain Claude Code, end to end${tag}`, fake,
      subtitle: 'per run: checker success, wall time, Claude cost, decision-model cost',
      panels: [
        { title: 'success', format: n => pct(n), rows: s.arms.map(a => ({ label: a.key, value: a.success })) },
        { title: 'wall time', format: ms, rows: s.arms.map(a => ({ label: a.key, value: a.wallMs })) },
        { title: 'Claude cost', format: usd, rows: s.arms.map(a => ({ label: a.key, value: a.claudeCost })) },
        { title: 'decision cost', format: usd, rows: s.arms.map(a => ({ label: a.key, value: a.decisionCost })) },
      ],
    })
  }
  return out
}

/** One line per backend: the recommended threshold, and what it scores against today's default. */
export function recommendations(adapter: DecisionAdapter, s: Summary): string[] {
  const t = adapter.threshold
  return s.backends.filter(b => b.recommended).map(b => {
    const r = b.recommended!
    const today = b.atDefault ? `; today's ${t.default}: ${pct(b.atDefault.accuracy)}` : ''
    return `${b.key}: ${t.name} ${r.threshold} (accuracy ${pct(r.accuracy)}${today})`
  })
}

/** The Markdown block for the README (between the bench markers), or for the fake summary file. */
export function markdown(adapter: DecisionAdapter, s: Summary, images: Record<string, string>): string {
  const t = adapter.threshold
  const lines: string[] = []
  if (s.fake) lines.push('> **FAKE BACKEND.** These numbers come from the bench\'s fake decision model and show only that the pipeline works. They say nothing about any model.', '')
  lines.push(`**Bench** (\`bun src/bench/report.ts ${adapter.feature}\`; ${s.versions.join(', ') || 'no results yet'}). ` +
    `Threshold swept: \`${t.name}\` (today ${t.default}). Recommended = ${adapter.objective ? adapter.objective.label : 'where accuracy peaks'}; a tie goes to the ${t.safer} value: ${t.saferMeans}.`, '')
  for (const name of ['accuracy', 'effect', 'cost-latency', 'task']) if (images[name]) lines.push(`![${name}](${images[name]})`)
  if (Object.keys(images).length) lines.push('')
  if (s.backends.length) {
    const extraKeys = [...new Set(s.backends.flatMap(b => Object.keys(b.recommended ? b.points.find(p => p.threshold === b.recommended!.threshold)?.metrics.extra ?? {} : {})))]
    lines.push(`| backend · model | cases | recommended | accuracy | precision | recall | F1 | ${adapter.effect} | ${extraKeys.join(' | ')}${extraKeys.length ? ' | ' : ''}p50 | p95 | cost/case |`)
    lines.push(`|---|---|---|---|---|---|---|---|${extraKeys.map(() => '---|').join('')}---|---|---|`)
    for (const b of s.backends) {
      const at = b.recommended ? b.points.find(p => p.threshold === b.recommended!.threshold)?.metrics : undefined
      const extra = extraKeys.map(k => (at?.extra[k] ?? '–')).join(' | ')
      lines.push(`| ${b.key} | ${b.rows - b.errors}${b.errors ? ` (+${b.errors} failed)` : ''} | ${b.recommended?.threshold ?? '–'} | ${pct(at?.accuracy)} | ${pct(at?.precision)} | ${pct(at?.recall)} | ${pct(at?.f1)} | ${pct(at?.effect)} | ${extra}${extraKeys.length ? ' | ' : ''}${ms(b.p50)} | ${ms(b.p95)} | ${usd(b.costPerCase)} |`)
    }
    for (const base of s.baselines) {
      lines.push(`| ${base.name} (no backend) | ${base.metrics.cases} | – | ${pct(base.metrics.accuracy)} | ${pct(base.metrics.precision)} | ${pct(base.metrics.recall)} | ${pct(base.metrics.f1)} | ${pct(base.metrics.effect)} | ${extraKeys.map(k => base.metrics.extra[k] ?? '–').join(' | ')}${extraKeys.length ? ' | ' : ''}– | – | $0 |`)
    }
    lines.push('', 'Recommended per backend:', '', ...recommendations(adapter, s).map(l => `- ${l}`), '')
  }
  if (s.arms.length) {
    lines.push('| arm | runs | success | score | wall time | Claude cost | decision cost | Claude tokens |', '|---|---|---|---|---|---|---|---|')
    for (const a of s.arms) lines.push(`| ${a.key} | ${a.runs} | ${pct(a.success)} | ${pct(a.score)} | ${ms(a.wallMs)} | ${usd(a.claudeCost)} | ${usd(a.decisionCost)} | ${a.tokens === null ? '–' : Math.round(a.tokens)} |`)
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * The recommended thresholds as settings to paste: a backends.json `tuning` entry per backend when
 * the threshold is a tuning key, else the config.json knob (one value for every backend), else a
 * note that the mod has no setting for it yet. Nothing is written.
 */
export function suggestTuning(adapter: DecisionAdapter, s: Summary): string {
  const t = adapter.threshold
  const picks = s.backends.filter(b => b.recommended)
  if (!picks.length) return `${adapter.feature}: no results to suggest from.`
  const out: string[] = [`# ${adapter.feature}: ${t.name}, recommended per backend${s.fake ? ' (FAKE backend: do not paste)' : ''}`]
  if (t.note) out.push(`# ${t.note}`)
  const where = t.where
  if ('tuning' in where) {
    out.push('# ~/.config/jev/backends.json: merge each "tuning" into that backend\'s entry')
    const backends = Object.fromEntries(picks.filter(b => !['typesafe', 'openrouter', 'venice', 'zen', 'default'].includes(b.backend))
      .map(b => [b.backend, { tuning: { [where.tuning]: b.recommended!.threshold } }]))
    out.push(JSON.stringify({ backends }, null, 2))
    const providers = picks.filter(b => ['typesafe', 'openrouter', 'venice', 'zen', 'default'].includes(b.backend))
    for (const p of providers) out.push(`# ${p.key}: ${p.recommended!.threshold} (a provider serves Jev, whose thresholds are the shipped defaults; no tuning entry)`)
  } else if ('knob' in where) {
    out.push(`# ${where.knob.feature}.${where.knob.name} is a jev-mod setting, one value for every backend: set it for the backend you use`)
    for (const b of picks) {
      out.push(`# ${b.key}:`, `/jev-mod ${where.knob.feature} ${where.knob.name} ${b.recommended!.threshold}`)
    }
  } else {
    out.push(`# ${where.none}`)
    for (const b of picks) out.push(`# ${b.key}: ${b.recommended!.threshold}`)
  }
  return out.join('\n')
}
