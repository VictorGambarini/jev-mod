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
  /** Runs that failed, by error code (`not_compacted`: the arm did not do its job). */
  errors: Record<string, number>
  success: number | null
  score: number | null
  wallMs: number | null
  /** The middle run's wall time, over the runs that were scored. */
  wallMedian: number | null
  /** Wall time summed over every run of the arm, failed ones too. */
  wallTotal: number | null
  claudeCost: number | null
  decisionCost: number | null
  /** Claude's and the decision model's cost per scored run, added. */
  totalCost: number | null
  /** `plain`: Claude Code with the feature off (arm `claude`); `jev-mod`: the feature on; `other`: any further arm (compaction's "no compaction"). */
  kind: 'plain' | 'jev-mod' | 'other'
  tokens: number | null
  /** The final step's context in tokens (what a compacted question read), over every run that reported it, failed ones too. */
  context: number | null
  /** What the mod's compactions kept and dropped, in messages, over the runs that recorded one. */
  compaction: { messages: number; kept: number; dropped: number } | null
}

export type Summary = {
  feature: string
  fake: boolean
  sweep: number[]
  backends: BackendSummary[]
  baselines: { name: string; metrics: Metrics }[]
  arms: ArmSummary[]
  /** The task level's shared setup, summed over its cases: never scored, always paid. */
  setup: { cases: number; claudeCost: number; wallMs: number } | null
  /** The task level's whole spend: every arm run (failed ones too) and the setup. */
  spend: { claude: number; decisions: number } | null
  versions: string[]
}

/** Each backend's answering model, the one most of its rows name: a case the feature settled
 * without a request has none, and belongs with the rest of its backend's rows. */
function answeredBy(rows: readonly Row[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>()
  for (const r of rows) {
    if (!r.answered_model) continue
    const mine = counts.get(r.backend.name) ?? new Map<string, number>()
    mine.set(r.answered_model, (mine.get(r.answered_model) ?? 0) + 1)
    counts.set(r.backend.name, mine)
  }
  return new Map([...counts].map(([name, mine]) => [name, [...mine].sort((a, b) => b[1] - a[1])[0]![0]]))
}

const keyOf = (models: Map<string, string>) => (r: Row) => {
  const model = r.answered_model ?? models.get(r.backend.name) ?? r.backend.model
  return `${r.backend.name}${model ? ` · ${model}` : ''}`
}

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
  const models = answeredBy(decision)
  for (const [key, mine] of groupBy(decision.filter(r => r.backend.kind !== 'baseline'), keyOf(models))) {
    const ok = mine.filter(r => r.outcome === 'ok')
    const points = sweep.map(threshold => ({ threshold, metrics: adapter.evaluate(mine, threshold) }))
    const latencies = ok.flatMap(r => r.latencies_ms)
    const tokens = ok.map(r => r.input_tokens).filter((n): n is number => n !== null)
    backends.push({
      key, backend: mine[0]!.backend.name, model: mine[0]!.answered_model ?? models.get(mine[0]!.backend.name) ?? mine[0]!.backend.model,
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
  const setupRows = task.filter(r => r.setup)
  // an arm's id already names its backend and settings
  const arms: ArmSummary[] = [...groupBy(task.filter(r => !r.setup), r => r.arm ?? '?')]
    .map(([key, mine]) => {
      const ok = mine.filter(r => r.outcome === 'ok')
      const num = (f: (r: Row) => number | undefined) => mean(ok.map(f).filter((n): n is number => typeof n === 'number'))
      const all = (f: (r: Row) => number | null | undefined) => mean(mine.map(f).filter((n): n is number => typeof n === 'number'))
      const compacted = mine.filter(r => r.compaction)
      const errors: Record<string, number> = {}
      for (const r of mine) if (r.outcome === 'error') errors[r.error ?? 'error'] = (errors[r.error ?? 'error'] ?? 0) + 1
      const claudeCost = num(r => r.claude_cost_usd)
      const decisionCost = num(r => r.cost_usd)
      const walls = mine.map(r => r.wall_ms).filter((n): n is number => typeof n === 'number')
      return {
        kind: key === 'claude' ? 'plain' as const : key.startsWith('jev-mod') ? 'jev-mod' as const : 'other' as const,
        wallMedian: percentile(ok.map(r => r.wall_ms).filter((n): n is number => typeof n === 'number'), 50),
        wallTotal: walls.length ? walls.reduce((a, b) => a + b, 0) : null,
        totalCost: claudeCost === null && decisionCost === null ? null : (claudeCost ?? 0) + (decisionCost ?? 0),
        key, arm: mine[0]!.arm ?? '?', backend: mine[0]!.backend.kind === 'baseline' ? null : mine[0]!.backend.name, runs: mine.length, errors,
        success: num(r => (r.success === undefined ? undefined : r.success ? 1 : 0)), score: num(r => r.score),
        wallMs: num(r => r.wall_ms), claudeCost, decisionCost,
        tokens: num(r => (r.claude_tokens ? r.claude_tokens.input + r.claude_tokens.output + r.claude_tokens.cache_read + r.claude_tokens.cache_write : undefined)),
        // a compaction that did too little is an error, and what it read and kept is the reason: these count every run
        context: all(r => r.context_tokens),
        compaction: compacted.length ? { messages: all(r => r.compaction?.messages)!, kept: all(r => r.compaction?.kept)!,
          dropped: all(r => r.compaction?.dropped)! } : null,
      }
    })
  const total = (mine: readonly Row[], f: (r: Row) => number | undefined) => mine.reduce((n, r) => n + (f(r) ?? 0), 0)
  const setup = setupRows.length
    ? { cases: setupRows.length, claudeCost: total(setupRows, r => r.claude_cost_usd), wallMs: total(setupRows, r => r.wall_ms) } : null
  const spend = task.length ? { claude: total(task, r => r.claude_cost_usd), decisions: total(task, r => r.cost_usd) } : null
  const versions = [...new Set(rows.map(r => `${r.jevmod}@${r.git.slice(0, 7)}`))]
  return { feature: adapter.feature, fake, sweep, backends, baselines, arms, setup, spend, versions }
}

const pct = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${(n * 100).toFixed(1)}%`)
const usd = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n === 0 ? '$0' : n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(3)}`)
const tok = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`)
const ms = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n >= 10_000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`)

const scoreOf = (adapter: DecisionAdapter, m: Metrics) => (adapter.objective?.score ?? ((x: Metrics) => x.accuracy))(m)

/** Does the best value found score higher than the shipped default (beyond a tie)? Then the two are told apart. */
export function bestDiffers(adapter: DecisionAdapter, b: BackendSummary): boolean {
  if (!b.recommended || !b.atDefault) return false
  if (Math.abs(b.recommended.threshold - adapter.threshold.default) < 1e-9) return false
  const at = b.points.find(p => p.threshold === b.recommended!.threshold)?.metrics
  return !!at && scoreOf(adapter, at) > scoreOf(adapter, b.atDefault) + 1e-3
}

const armLabel = (a: ArmSummary) => (a.kind === 'plain' ? 'plain Claude Code' : a.key)

/** The SVG plots, by file stem (`accuracy`, `effect`, `cost-latency`, `task`), only those with data. */
export function plots(adapter: DecisionAdapter, s: Summary): Record<string, string> {
  const out: Record<string, string> = {}
  const fake = s.fake
  const tag = fake ? ' (FAKE)' : ''
  const t = adapter.threshold
  // one line: the value jev-mod ships; and, only where it differs, the best value found
  const guides: { x: number; label: string; line?: number }[] = [{ x: t.default, label: `default ${t.default}` }]
  for (const v of [...new Set(s.backends.filter(b => bestDiffers(adapter, b)).map(b => b.recommended!.threshold))]) guides.push({ x: v, label: `best ${v}`, line: 1 })
  if (s.backends.length) {
    out.accuracy = lineChart({
      title: `${adapter.title}: accuracy against ${t.name}${tag}`,
      subtitle: `ringed: the best value per backend (${adapter.objective ? adapter.objective.label : 'peak accuracy'}; ties go ${t.safer})`,
      xLabel: `${t.name} threshold`, yLabel: 'accuracy', percent: true, yMin: 0, yMax: 1, fake, guides,
      series: s.backends.map(b => ({ name: b.key, mark: b.recommended?.threshold, points: b.points.map(p => ({ x: p.threshold, y: p.metrics.cases ? p.metrics.accuracy : null })) })),
    })
    out.effect = lineChart({
      title: `${adapter.title}: ${adapter.effect} against ${t.name}${tag}`,
      xLabel: `${t.name} threshold`, yLabel: adapter.effect, percent: true, yMin: 0, fake, guides,
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
    const rows = (f: (a: ArmSummary) => number | null) => s.arms.map(a => ({ label: armLabel(a), value: f(a), tone: a.kind === 'plain' ? 'plain' as const : undefined }))
    const extra = (title: string, format: (n: number) => string, f: (a: ArmSummary) => number | null) =>
      s.arms.some(a => f(a) !== null) ? [{ title, format, rows: rows(f) }] : []
    out.task = barPanels({
      title: `${adapter.title}: plain Claude Code (orange) against jev-mod, end to end${tag}`, fake,
      subtitle: 'accuracy: success and score · speed: median wall time per run · cost per run: Claude, decisions, both',
      panels: [
        { title: 'success', format: n => pct(n), max: 1, rows: rows(a => a.success) },
        { title: 'score', format: n => pct(n), max: 1, rows: rows(a => a.score) },
        { title: 'wall time (median)', format: ms, rows: rows(a => a.wallMedian) },
        { title: 'Claude cost', format: usd, rows: rows(a => a.claudeCost) },
        { title: 'decision cost', format: usd, rows: rows(a => a.decisionCost) },
        { title: 'total cost', format: usd, rows: rows(a => a.totalCost) },
        ...extra('question context', tok, a => a.context),
        ...extra('messages dropped', n => `${Math.round(n)}`, a => a.compaction?.dropped ?? null),
      ],
    })
  }
  return out
}

/** One line per backend: the best threshold, and what it scores against the shipped default. */
export function recommendations(adapter: DecisionAdapter, s: Summary): string[] {
  const t = adapter.threshold
  return s.backends.filter(b => b.recommended).map(b => {
    const r = b.recommended!
    const base = b.atDefault ? `; default ${t.default}: ${pct(b.atDefault.accuracy)}` : ''
    return `${b.key}: ${t.name} ${r.threshold} (accuracy ${pct(r.accuracy)}${base})`
  })
}

const fill = (template: string, m: Metrics) => template.replace('{pct}', pct(m.accuracy)).replace('{n}', `${m.cases}`)

/** "What this means", from the numbers: the score at the default and at the best value, and what to make of a difference. */
export function meaning(adapter: DecisionAdapter, s: Summary): string[] {
  const t = adapter.threshold
  const e = adapter.explain
  const out: string[] = []
  for (const b of s.backends) {
    if (!b.atDefault || !b.recommended || !b.atDefault.cases) continue
    const who = s.backends.length > 1 ? `${b.key}: ` : ''
    const said = e?.result ? fill(e.result, b.atDefault) : `Jev scores ${pct(b.atDefault.accuracy)} on ${b.atDefault.cases} cases`
    const best = b.points.find(p => p.threshold === b.recommended!.threshold)!.metrics
    if (t.name === 'none') { out.push(`${who}${said}.`); continue }
    if (!bestDiffers(adapter, b)) {
      out.push(`${who}At the default ${t.default}, ${said}. No value in the sweep does better, so the default stays.`)
      continue
    }
    out.push(`${who}At the default ${t.default}, ${said}; at the best value found, ${b.recommended.threshold}, the same score is ${pct(best.accuracy)}.`)
    out.push(`${who}The shipped default (${t.default}) is not the best value found (${b.recommended.threshold}). ` +
      (t.keptBecause ? `It is kept on purpose: ${t.keptBecause.replace(/\.?$/, '.')}` : 'Not yet changed.'))
  }
  return out
}

const COLUMNS: [string, string][] = [
  ['best', 'the value of the setting where the score peaks (the plot marks it only when it differs from the default).'],
  ['accuracy', 'the share of items where acting or not acting matched the label.'],
  ['precision', 'when the feature acts, how often acting was right.'],
  ['recall', 'of what it should have acted on, how much it did.'],
  ['F1', 'precision and recall in one number.'],
]

/** The Markdown block for the README (between the bench markers), or for the fake summary file. */
export function markdown(adapter: DecisionAdapter, s: Summary, images: Record<string, string>): string {
  const t = adapter.threshold
  const e = adapter.explain
  const lines: string[] = []
  const show = (name: string) => { if (images[name]) lines.push(`![${name}](${images[name]})`) }
  if (s.fake) lines.push('> **FAKE BACKEND.** These numbers come from the bench\'s fake decision model and show only that the pipeline works. They say nothing about any model.', '')
  lines.push(`**Bench** (\`bun src/bench/report.ts ${adapter.feature}\`; ${s.versions.join(', ') || 'no results yet'}).`, '')
  if (e) {
    lines.push(`- **One case:** ${e.oneCase}`, `- **Measured:** ${e.measured}`,
      `- **The setting:** ${e.setting}${t.name === 'none' ? '' : ` (\`${t.name}\`, default ${t.default})`}`, '')
  }
  // against plain Claude Code
  lines.push('**Compared with plain Claude Code:' + (s.arms.length ? '**' : ' not yet.** No task-level run of this feature (a real Claude Code session with it off, then on, on the same task) has been made.'), '')
  if (s.arms.length) {
    show('task')
    if (images.task) lines.push('')
    lines.push('| arm | runs | success | mean score | median time | total time | Claude cost | decision cost | total cost |', '|---|---|---|---|---|---|---|---|---|')
    const failed = (a: ArmSummary) => Object.entries(a.errors).map(([code, n]) => `${n} ${code}`).join(', ')
    for (const a of s.arms) lines.push(`| ${armLabel(a)} | ${a.runs}${failed(a) ? ` (failed: ${failed(a)})` : ''} | ${pct(a.success)} | ${pct(a.score)} | ${ms(a.wallMedian)} | ${ms(a.wallTotal)} | ${usd(a.claudeCost)} | ${usd(a.decisionCost)} | ${usd(a.totalCost)} |`)
    lines.push('',
      '- success: the share of scored runs the checker marked right; mean score: its partial credit (the share of questions answered right, say).',
      '- median time: over scored runs; total time: every run of the arm, failed ones too.',
      '- costs are per scored run; total cost is Claude plus the decision model. A failed run is never scored.', '')
    const plain = s.arms.find(a => a.kind === 'plain')
    if (!plain) lines.push('Plain Claude Code was not run here, so there is nothing to compare the jev-mod arms with yet.', '')
    for (const a of s.arms.filter(x => x.kind === 'jev-mod')) {
      if (a.success === null) { lines.push(`- ${a.key}: no scored run${failed(a) ? ` (${failed(a)})` : ''}.`); continue }
      if (!plain) continue
      const vs = (x: string, y: string) => `${x} (plain Claude Code ${y})`
      lines.push(`- ${a.key}: right on ${vs(pct(a.success), pct(plain.success))} of runs, median ${vs(ms(a.wallMedian), ms(plain.wallMedian))}, ` +
        `${vs(usd(a.totalCost), usd(plain.totalCost))} per run (Claude ${usd(a.claudeCost)}, decisions ${usd(a.decisionCost)}).`)
    }
    if (s.arms.some(x => x.kind === 'jev-mod')) lines.push('')
    if (s.arms.some(a => a.context !== null || a.compaction)) {
      const kd = (a: ArmSummary) => (a.compaction ? `${Math.round(a.compaction.kept)} / ${Math.round(a.compaction.dropped)} of ${Math.round(a.compaction.messages)}` : '–')
      lines.push('| arm | question context | kept / dropped | Claude tokens |', '|---|---|---|---|')
      for (const a of s.arms) lines.push(`| ${armLabel(a)} | ${tok(a.context)} | ${kd(a)} | ${a.tokens === null ? '–' : Math.round(a.tokens)} |`)
      lines.push('', '- question context: what the last step read, in tokens (a smaller one is a compaction that worked); kept / dropped: messages the compaction kept and dropped, of those before it.', '')
    }
    if (s.spend) {
      const setup = s.setup ? `, of which the shared setup ${usd(s.setup.claudeCost)} (${s.setup.cases} case(s), ${ms(s.setup.wallMs)})` : ''
      lines.push(`Spend in all: ${usd(s.spend.claude)} Claude${setup}; ${usd(s.spend.decisions)} decisions. ` +
        'A failed run is never scored, but its spend counts here.', '')
    }
  }
  // the decision level
  if (s.backends.length) {
    lines.push(`**Decision level.** Jev answers each case by itself, and the bench replays its answers at every value of \`${t.name}\`. ` +
      `Best = ${adapter.objective ? adapter.objective.label : 'where accuracy peaks'}; a tie goes to the ${t.safer} value: ${t.saferMeans}.`, '')
    const said = meaning(adapter, s)
    if (said.length) lines.push('**What this means.** ' + said.join(' '), '')
    for (const name of ['accuracy', 'effect', 'cost-latency']) show(name)
    if (['accuracy', 'effect', 'cost-latency'].some(n => images[n])) lines.push('')
    const extraKeys = [...new Set(s.backends.flatMap(b => Object.keys(b.recommended ? b.points.find(p => p.threshold === b.recommended!.threshold)?.metrics.extra ?? {} : {})))]
    lines.push(`| backend · model | cases | best | accuracy | precision | recall | F1 | ${adapter.effect} | ${extraKeys.join(' | ')}${extraKeys.length ? ' | ' : ''}p50 | p95 | cost/case |`)
    lines.push(`|---|---|---|---|---|---|---|---|${extraKeys.map(() => '---|').join('')}---|---|---|`)
    for (const b of s.backends) {
      const at = b.recommended ? b.points.find(p => p.threshold === b.recommended!.threshold)?.metrics : undefined
      const extra = extraKeys.map(k => (at?.extra[k] ?? '–')).join(' | ')
      lines.push(`| ${b.key} | ${b.rows - b.errors}${b.errors ? ` (+${b.errors} failed)` : ''} | ${b.recommended?.threshold ?? '–'} | ${pct(at?.accuracy)} | ${pct(at?.precision)} | ${pct(at?.recall)} | ${pct(at?.f1)} | ${pct(at?.effect)} | ${extra}${extraKeys.length ? ' | ' : ''}${ms(b.p50)} | ${ms(b.p95)} | ${usd(b.costPerCase)} |`)
    }
    for (const base of s.baselines) {
      lines.push(`| ${base.name} (no backend) | ${base.metrics.cases} | – | ${pct(base.metrics.accuracy)} | ${pct(base.metrics.precision)} | ${pct(base.metrics.recall)} | ${pct(base.metrics.f1)} | ${pct(base.metrics.effect)} | ${extraKeys.map(k => base.metrics.extra[k] ?? '–').join(' | ')}${extraKeys.length ? ' | ' : ''}– | – | $0 |`)
    }
    lines.push('', ...COLUMNS.map(([k, v]) => `- ${k}: ${v}`),
      `- ${adapter.effect}: the share of items the feature acts on, at the best value.`,
      ...extraKeys.map(k => `- ${k}: ${e?.columns?.[k] ?? 'an extra measure, at the best value.'}`),
      '- p50, p95: how long a decision call took (the middle one, and the slow end); cost/case: what the decision calls cost per case.', '',
      'Best per backend:', '', ...recommendations(adapter, s).map(l => `- ${l}`), '')
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
