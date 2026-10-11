import { test, expect } from 'claude-code/testing'
import { itemMetrics } from './metrics'
import { END, START, insertBetweenMarkers, markdown, plots, suggestTuning, summarise } from './summary'
import type { DecisionAdapter, Row } from './types'

const README = `# Rules gate\n\nWhat it does.\n\n## Bench\n\n${START}\nold numbers\n${END}\n\n## More\n`

test('the bench block replaces what is between the markers, and nothing else', () => {
  const once = insertBetweenMarkers(README, '| new | table |')!
  expect(once).toBe(`# Rules gate\n\nWhat it does.\n\n## Bench\n\n${START}\n| new | table |\n${END}\n\n## More\n`)
  // running it again with the same block changes nothing
  expect(insertBetweenMarkers(once, '| new | table |')).toBe(once)
})

test('a README without both markers is left alone', () => {
  expect(insertBetweenMarkers('# Compact\n\nno markers here\n', 'x')).toBe(null)
  expect(insertBetweenMarkers(`# x\n${START}\nonly a start\n`, 'x')).toBe(null)
  expect(insertBetweenMarkers(`# x\n${END}\n${START}\n`, 'x')).toBe(null) // in the wrong order
})

const gate: DecisionAdapter = {
  feature: 'rules-gate', title: 'Rules gate', effect: 'rules judged broken',
  threshold: { name: 'minConfidence', default: 0.8, from: 0.5, to: 0.9, step: 0.1, safer: 'higher', saferMeans: 'refuses fewer edits',
    where: { knob: { feature: 'rules-gate', name: 'minConfidence' } } },
  cases: () => [], caseId: () => '', judge: async () => ({ items: [], calls: [], errors: [] }), truth: () => undefined,
  evaluate: itemMetrics,
}

function row(backend: string, model: string, scores: [boolean, number][], over: Partial<Row> = {}): Row {
  return {
    schema: 1, run: 'r', feature: 'rules-gate', level: 'decision', jevmod: '0.10.0', git: 'abcdef0123', date: '2026-10-11T00:00:00Z',
    backend: { name: backend, kind: backend === 'typesafe' ? 'provider' : 'named', model }, answered_model: model, settings: {},
    sweep: null, case: 'c', outcome: 'ok', items: scores.map(([gold, score], i) => ({ id: `rule_${i + 1}`, gold, score })),
    calls: 1, latencies_ms: [200], input_tokens: 1000, cost_usd: 0.000042, ...over,
  }
}

// typesafe separates cleanly above 0.7; laya's one wrong yes sits at 0.75, so it peaks from 0.8
const rows = [
  row('typesafe', 'jev-1.13', [[true, 0.95], [true, 0.85], [false, 0.3], [false, 0.65]]),
  row('laya', 'laya', [[true, 0.9], [true, 0.82], [false, 0.75], [false, 0.2]], { latencies_ms: [900], cost_usd: 0 }),
  row('laya', 'laya', [], { outcome: 'error', error: 'timeout', latencies_ms: [] }),
]

test('the summary sweeps each backend and recommends its peak, ties to the safer side', () => {
  const s = summarise(gate, rows, false)
  expect(s.sweep).toEqual([0.5, 0.6, 0.7, 0.8, 0.9])
  const by = Object.fromEntries(s.backends.map(b => [b.backend, b]))
  // typesafe: 100% from 0.7 to 0.8 (0.9 misses the 0.85): the higher tie, 0.8
  expect(by.typesafe!.recommended).toEqual({ threshold: 0.8, accuracy: 1 })
  // laya: 100% at 0.8 only
  expect(by.laya!.recommended).toEqual({ threshold: 0.8, accuracy: 1 })
  expect(by.laya!.errors).toBe(1)
  expect(by.laya!.p50).toBe(900)
})

test('the plots, the table and the tuning snippet', () => {
  const s = summarise(gate, rows, false)
  const svgs = plots(gate, s)
  expect(Object.keys(svgs).sort()).toEqual(['accuracy', 'cost-latency', 'effect'])
  for (const svg of Object.values(svgs)) {
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('prefers-color-scheme: dark')
    expect(svg).not.toContain('FAKE')
  }
  const md = markdown(gate, s, { accuracy: 'bench/results/accuracy.svg' })
  expect(md).toContain('![accuracy](bench/results/accuracy.svg)')
  expect(md).toContain('| typesafe · jev-1.13 | 1 | 0.8 | 100.0%')
  expect(md).toContain('laya · laya: minConfidence 0.8')
  const tuning = suggestTuning(gate, s)
  expect(tuning).toContain('/jev-mod rules-gate minConfidence 0.8')
  // a threshold that is a backends.json tuning key: an entry per named backend, none for a provider
  const tuned = suggestTuning({ ...gate, threshold: { ...gate.threshold, where: { tuning: 'webscreen.injection_threshold' } } }, s)
  expect(tuned).toContain('"laya": {')
  expect(tuned).toContain('"webscreen.injection_threshold": 0.8')
  expect(tuned).toContain('typesafe · jev-1.13: 0.8 (a provider serves Jev')
})

test('fake results say so in every plot and in the table', () => {
  const fake = rows.map(r => ({ ...r, backend: { name: 'fake', kind: 'fake' as const, model: 'fake-jev' }, answered_model: 'fake-jev', fake: true as const }))
  const s = summarise(gate, fake, true)
  for (const svg of Object.values(plots(gate, s))) expect(svg).toContain('FAKE BACKEND')
  expect(markdown(gate, s, {})).toContain('**FAKE BACKEND.**')
  expect(suggestTuning(gate, s)).toContain('FAKE backend: do not paste')
})

test('task-level rows become one bar per arm', () => {
  const task = (arm: string, success: boolean, claude: number): Row => ({
    ...row('typesafe', 'jev-1.13', []), level: 'task', arm, success, score: success ? 1 : 0.5, wall_ms: 30_000, claude_cost_usd: claude,
    ...(arm === 'claude' ? { backend: { name: 'claude code', kind: 'baseline' as const, model: null } } : {}),
  })
  const s = summarise(gate, [task('claude', false, 0.4), task('claude', true, 0.5), task('jev-mod typesafe minConfidence=0.8', true, 0.3)], false)
  expect(s.arms.map(a => [a.key, a.success])).toEqual([['claude', 0.5], ['jev-mod typesafe minConfidence=0.8', 1]])
  expect(plots(gate, s).task).toContain('wall time')
})

test('task level: the setup is no arm, a failed run is never scored, and the spend holds both', () => {
  const task = (arm: string, over: Partial<Row>): Row => ({
    ...row('typesafe', 'jev-1.13', []), level: 'task', arm, wall_ms: 30_000, claude_cost_usd: 0.5, cost_usd: 0.001, ...over,
  })
  const rows = [
    task('setup', { setup: true, claude_cost_usd: 2, cost_usd: 0, wall_ms: 60_000 }),
    task('no compaction', { success: true, score: 1 }),
    task('jev-mod typesafe drop=0.7', { success: true, score: 1, context_tokens: 60_000, compaction: { messages: 300, kept: 120, dropped: 180, skip: null } }),
    task('jev-mod typesafe drop=0.7', { outcome: 'error', error: 'not_compacted', claude_cost_usd: 0.4, context_tokens: 130_000,
      compaction: { messages: 300, kept: 300, dropped: 0, skip: 'Jev marked no turn drop; nothing to remove' } }),
  ]
  const s = summarise(gate, rows, false)
  expect(s.arms.map(a => a.key)).toEqual(['no compaction', 'jev-mod typesafe drop=0.7'])
  const jev = s.arms[1]!
  expect([jev.runs, jev.errors, jev.score]).toEqual([2, { not_compacted: 1 }, 1])
  expect(s.setup).toEqual({ cases: 1, claudeCost: 2, wallMs: 60_000 })
  expect(Math.round(s.spend!.claude * 1000)).toBe(3400)
  const md = markdown(gate, s, {})
  expect(md).toContain('| jev-mod typesafe drop=0.7 | 2 (failed: 1 not_compacted) |')
  // what the question read and what the compaction kept count every run: a failed one is the reason it failed
  expect([jev.context, jev.compaction]).toEqual([95_000, { messages: 300, kept: 210, dropped: 90 }])
  expect(md).toContain('| 95.0k | 210 / 90 of 300 |')
  expect(s.arms[0]!.compaction).toBe(null)
  const svg = plots(gate, s).task!
  expect(svg).toContain('question context')
  expect(svg).toContain('messages dropped')
  expect(md).toContain('Spend in all: $3.400 Claude, of which the shared setup $2.000 (1 case(s), 60.0 s)')
})

test('a case settled without a request counts with its backend, not as a backend of its own', () => {
  const local = row('openrouter', 'jev-latest', [[true, 1]], { answered_model: null, calls: 0, latencies_ms: [], cost_usd: 0 })
  const asked = row('openrouter', 'jev-latest', [[false, 0.2]], { answered_model: 'jev-1.13' })
  const s = summarise(gate, [local, asked], false)
  expect(s.backends.map(b => b.key)).toEqual(['openrouter · jev-1.13'])
  expect(s.backends[0]!.rows).toBe(2)
})
