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

test('task level: the compaction step and the question step are timed apart', () => {
  const task = (arm: string, step_ms?: number[]): Row => ({
    ...row('typesafe', 'jev-1.13', []), level: 'task', arm, success: true, score: 1, wall_ms: 30_000, claude_cost_usd: 0.5,
    context_tokens: 50_000, ...(step_ms ? { step_ms } : {}),
  })
  const s = summarise(gate, [task('no compaction', [9_000]), task('jev-mod typesafe', [4_000, 10_000]), task('jev-mod typesafe', [6_000, 12_000]),
    task('jev-mod typesafe', [8_000, 14_000]), task('claude', [70_000, 8_000]), task('other')], false)
  const by = Object.fromEntries(s.arms.map(a => [a.key, a.stepsMs]))
  expect(by['no compaction']).toEqual({ before: null, final: 9_000 })
  expect(by['jev-mod typesafe']).toEqual({ before: 6_000, final: 12_000 })
  expect(by['claude']).toEqual({ before: 70_000, final: 8_000 })
  expect(by['other']).toBe(null)
  const md = markdown(gate, s, {})
  expect(md).toContain('| compaction time | question time |')
  expect(md).toContain("| jev-mod typesafe | 50.0k | – | – | 6000 ms | 12.0 s |")
})

test('a case settled without a request counts with its backend, not as a backend of its own', () => {
  const local = row('openrouter', 'jev-latest', [[true, 1]], { answered_model: null, calls: 0, latencies_ms: [], cost_usd: 0 })
  const asked = row('openrouter', 'jev-latest', [[false, 0.2]], { answered_model: 'jev-1.13' })
  const s = summarise(gate, [local, asked], false)
  expect(s.backends.map(b => b.key)).toEqual(['openrouter · jev-1.13'])
  expect(s.backends[0]!.rows).toBe(2)
})

const explained: DecisionAdapter = {
  ...gate,
  explain: { oneCase: 'an edit and its rules', measured: 'whether each rule is judged right', setting: 'how sure Jev must be',
    result: 'Jev judges {pct} of the {n} rules right' },
}

test('the plots mark one default line, and a best line only where the best value differs; none says today', () => {
  const s = summarise(gate, rows, false)
  // both backends peak at 0.8 and the default is 0.8: one guide
  const same = plots(gate, s).accuracy!
  expect(same).toContain('default 0.8')
  expect(same).not.toContain('best 0.8')
  expect(same).not.toContain('today')
  const moved = plots({ ...gate, threshold: { ...gate.threshold, default: 0.5 } }, summarise({ ...gate, threshold: { ...gate.threshold, default: 0.5 } }, rows, false)).accuracy!
  expect(moved).toContain('default 0.5')
  expect(moved).toContain('best 0.8')
})

test('the section opens in plain words and says what the numbers mean', () => {
  const md = markdown(explained, summarise(explained, rows, false), {})
  expect(md).toContain('- **One case:** an edit and its rules')
  expect(md).toContain('- **Measured:** whether each rule is judged right')
  expect(md).toContain('(`minConfidence`, default 0.8)')
  expect(md).toContain('**What this means.**')
  expect(md).toContain('At the default 0.8, Jev judges 100.0% of the 1 rules right')
  expect(md).toContain('No value in the sweep does better')
  expect(md).not.toContain('today')
})

test('a default that differs from the best says so, with the reason when the adapter has one', () => {
  const at = (keptBecause?: string): DecisionAdapter => ({ ...explained, threshold: { ...explained.threshold, default: 0.5, keptBecause } })
  const text = (a: DecisionAdapter) => markdown(a, summarise(a, rows, false), {})
  const plain = text(at())
  expect(plain).toContain('The shipped default (0.5) is not the best value found (0.8). Not yet changed.')
  expect(plain).toContain('the same score is 100.0%')
  expect(text(at('asks the person less'))).toContain('It is kept on purpose: asks the person less')
})

test('without task rows the comparison with plain Claude Code says not yet', () => {
  const md = markdown(explained, summarise(explained, rows, false), {})
  expect(md).toContain('**Compared with plain Claude Code: not yet.**')
  expect(md.indexOf('Compared with plain Claude Code')).toBeLessThan(md.indexOf('| backend · model |'))
})

test('task rows give a comparison table with accuracy, speed and cost, plain Claude Code first, for any feature', () => {
  const task = (arm: string, over: Partial<Row>): Row => ({
    ...row('typesafe', 'jev-1.13', []), level: 'task', arm, outcome: 'ok', success: true, score: 1, ...over,
  })
  const plainBackend = { backend: { name: 'claude code', kind: 'baseline' as const, model: null } }
  const rs = [
    // three cases, one run each (several runs of one case add an interval and a per-case table: the repeated-runs test)
    task('claude', { ...plainBackend, case: 'c1', wall_ms: 40_000, claude_cost_usd: 0.6, cost_usd: 0 }),
    task('claude', { ...plainBackend, case: 'c2', wall_ms: 80_000, claude_cost_usd: 0.8, cost_usd: 0, success: false, score: 0.5 }),
    task('claude', { ...plainBackend, case: 'c3', wall_ms: 60_000, claude_cost_usd: 0.7, cost_usd: 0 }),
    task('jev-mod typesafe minConfidence=0.8', { wall_ms: 20_000, claude_cost_usd: 0.3, cost_usd: 0.01,
      by_feature: { [explained.feature]: { requests: 2, calls: 2, cost_usd: 0.008 }, screening: { requests: 1, calls: 1, cost_usd: 0.002 } } }),
  ]
  const s = summarise(explained, [...rows, ...rs], false)
  const [plain, jev] = s.arms
  expect([plain!.kind, jev!.kind]).toEqual(['plain', 'jev-mod'])
  expect([plain!.wallMedian, plain!.wallTotal, jev!.totalCost]).toEqual([60_000, 180_000, 0.31])
  // the feature's own decisions apart from what other jev-mod features asked
  expect([jev!.featureCost, Math.round(jev!.otherCost! * 1e6)]).toEqual([0.008, 2000])
  const md = markdown(explained, s, { task: 'task.svg' })
  expect(md).toContain('![task](task.svg)')
  expect(md).toContain('| arm | runs | success | mean score | median time | total time | Claude cost | feature decision cost | other jev-mod decision cost | total cost |')
  expect(md.indexOf('| plain Claude Code | 3 |')).toBeLessThan(md.indexOf('| jev-mod typesafe minConfidence=0.8 | 1 |'))
  expect(md).toContain('| plain Claude Code | 3 | 66.7% | 83.3% | 60.0 s | 180.0 s | $0.700 | $0 | $0 | $0.700 |')
  expect(md).toContain('| jev-mod typesafe minConfidence=0.8 | 1 | 100.0% | 100.0% | 20.0 s | 20.0 s | $0.300 | $0.00800 | $0.00200 | $0.310 |')
  expect(markdown(explained, s, {}, '**By difficulty**')).toContain('**By difficulty**')
  expect(md).toContain('- jev-mod typesafe minConfidence=0.8: right on 100.0% (plain Claude Code 66.7%) of runs, median 20.0 s (plain Claude Code 60.0 s)')
  // the comparison comes before the decision-level table
  expect(md.indexOf('| plain Claude Code |')).toBeLessThan(md.indexOf('| backend · model |'))
  const svg = plots(explained, s).task!
  for (const word of ['success', 'score', 'wall time (median)', 'Claude cost', 'feature decision cost', 'other decision cost', 'total cost']) expect(svg).toContain(word)
  expect(svg).not.toContain('question context')
})

test('repeated runs: success over every run with its interval, each case\'s pass count, the median over every run; one run each reads as before', () => {
  const plainBackend = { backend: { name: 'claude code', kind: 'baseline' as const, model: null } }
  const task = (arm: string, c: string, repeat: number | undefined, success: boolean, wall: number, over: Partial<Row> = {}): Row => ({
    ...row('typesafe', 'jev-1.13', []), level: 'task', arm, case: c, ...(repeat ? { repeat } : {}), outcome: 'ok', success, score: success ? 1 : 0,
    wall_ms: wall, claude_cost_usd: 0.3, cost_usd: 0, ...(arm === 'claude' ? plainBackend : {}), ...over,
  })
  const jev = 'jev-mod openrouter'
  const rs = [
    task('claude', 'a', 1, true, 10_000), task('claude', 'a', 2, true, 20_000), task('claude', 'a', 3, false, 30_000),
    task('claude', 'b', 1, true, 40_000), task('claude', 'b', 2, true, 50_000), task('claude', 'b', 3, true, 60_000),
    task(jev, 'a', 1, true, 5_000), task(jev, 'a', 2, true, 6_000), task(jev, 'a', 3, true, 7_000),
    task(jev, 'b', 1, false, 8_000), task(jev, 'b', 2, true, 9_000), task(jev, 'b', 3, false, 10_000, { outcome: 'error', error: 'timeout', success: undefined, score: undefined }),
  ]
  const s = summarise(explained, rs, false)
  expect(s.repeated).toBe(true)
  const [plain, mod] = s.arms
  expect([plain!.passed, plain!.scored, plain!.success]).toEqual([5, 6, 5 / 6])
  expect([mod!.passed, mod!.scored, mod!.runs]).toEqual([4, 5, 6])
  expect(mod!.perCase).toEqual([{ case: 'a', passed: 3, scored: 3, runs: 3 }, { case: 'b', passed: 1, scored: 2, runs: 3 }])
  // the median is over every scored run of every case
  expect([plain!.wallMedian, mod!.wallMedian]).toEqual([30_000, 7_000])
  const w = plain!.interval!
  expect([Math.round(w.lo * 1000), Math.round(w.hi * 1000)]).toEqual([436, 970])
  const md = markdown(explained, s, {})
  expect(md).toContain('| arm | runs | success (95% interval) | mean score |')
  expect(md).toContain('| plain Claude Code | 6 | 83.3% (44–97%) |')
  expect(md).toContain(`| ${jev} | 6 (failed: 1 timeout) | 80.0% (38–96%) |`)
  expect(md).toContain(`| case | plain Claude Code | ${jev} |`)
  expect(md).toContain('| a | 2/3 | 3/3 |')
  expect(md).toContain('| b | 3/3 | 1/2 (+1 failed) |')
  expect(md).toContain('a 95% Wilson interval')
  expect(md).toContain(`- ${jev}: right on 80.0% [38–96%] (plain Claude Code 83.3% [44–97%]) of runs`)
  const svg = plots(explained, s).task!
  expect(svg).toContain('class="rg"')
  expect(svg).toContain('its 95% interval')

  // rows from before --repeat, one per case and arm with no repeat field, read as one run each: no interval, no per-case table
  const old = rs.filter(r => r.repeat === 1).map(({ repeat: _, ...r }) => r as Row)
  const o = summarise(explained, old, false)
  expect(o.repeated).toBe(false)
  expect(o.arms[0]!.perCase).toEqual([{ case: 'a', passed: 1, scored: 1, runs: 1 }, { case: 'b', passed: 1, scored: 1, runs: 1 }])
  const omd = markdown(explained, o, {})
  expect(omd).toContain('| arm | runs | success | mean score |')
  expect(omd).not.toContain('| case |')
  expect(omd).not.toContain('Wilson')
  expect(plots(explained, o).task).not.toContain('class="rg"')
})
