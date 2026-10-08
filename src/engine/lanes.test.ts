import { test, expect } from 'claude-code/testing'
import grid from '../../test/parity/fixtures/lane_grid'
import lanePolicy from '../../test/parity/fixtures/lane_policy'
import targetRows from '../../test/parity/fixtures/lane_targets'
import runs from '../../test/parity/fixtures/lanes'
import engine from '../../test/parity/fixtures/policy_engine'
import linted from '../../test/parity/fixtures/policy_lint'
import { LANE_DIVERGENCES } from '../../test/parity/divergences'
import type { Host } from './client'
import { LANE_POLICY_TEXT } from './lane-policy'
import { admitState, chargeState, classify, LIMIT_DEFAULTS, limitConfig, targets, type Limits } from './lanes'
import { apply, drifted, lint, parse, preDecide, readings, versionOf, type Policy } from './policy'
import { loads } from './pyjson'

const sorted = (value: unknown): string => JSON.stringify(value ?? null, (_, v) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1))) : v)

const LANE = parse(LANE_POLICY_TEXT, 'lane', 'shipped')

test('the shipped lane policy is jev-skills’ own, and it lints clean', () => {
  const { _origin, ...plain } = LANE
  expect(sorted(plain)).toBe(sorted(lanePolicy))
  expect(lint(loads(LANE_POLICY_TEXT))).toEqual([])
})

test('lint finds what policy.lint found, in its words, on every shipped policy and each broken lane policy', () => {
  const wrong = (linted as unknown as { name: string; text: string; problems: string[] }[])
    .map(c => ({ name: c.name, got: lint(loads(c.text)), want: c.problems }))
    .filter(c => JSON.stringify(c.got) !== JSON.stringify(c.want))
  expect(wrong).toEqual([])
})

test('readings and the lane rules give policy.readings and policy.apply’s answer on the whole grid', () => {
  type Row = { answers: Record<string, any>; values: unknown; applied: unknown }
  const rows = grid as unknown as Row[]
  const wrong: unknown[] = []
  for (const [n, row] of rows.entries()) {
    const values = readings(LANE.questions, row.answers, LANE.uncertain_band)
    if (sorted(values) !== sorted(row.values)) wrong.push({ n, what: 'values', got: values, want: row.values })
    const applied = apply(LANE, values)
    if (sorted(applied) !== sorted(row.applied)) wrong.push({ n, what: 'applied', got: applied, want: row.applied })
  }
  expect(wrong.slice(0, 5)).toEqual([])
  expect(rows.length).toBeGreaterThan(1000)
})

test('pre-rules read the caller’s facts as Python compares them', () => {
  const { pre } = engine as unknown as { pre: { facts: Record<string, unknown>; pre: unknown }[] }
  const wrong = pre.filter(c => sorted(preDecide(LANE, c.facts)) !== sorted(c.pre)).map(c => ({ facts: c.facts, got: preDecide(LANE, c.facts), want: c.pre }))
  expect(wrong).toEqual([])
})

test('drift and versions read as policy.drifted and policy.version_of', () => {
  const { drift } = engine as unknown as { drift: { tuned_on: string | null; model: string | null; drift: boolean | null; version: number[] }[] }
  const wrong = drift.filter(c => drifted(c.tuned_on, c.model) !== c.drift || JSON.stringify(versionOf(c.model)) !== JSON.stringify(c.version))
    .map(c => ({ ...c, got: [drifted(c.tuned_on, c.model), versionOf(c.model)] }))
  expect(wrong).toEqual([])
})

test('the lane table with lanes.json laid on top is lanes.targets', () => {
  const rows = targetRows as unknown as { xdg: unknown; shared: unknown; targets: unknown }[]
  // The files as the feature reads them: one that is not JSON, or not an object, is passed over.
  const table = (t: unknown) => (typeof t === 'string' ? undefined : t)
  const wrong = rows.map(r => ({ r, got: targets([table(r.xdg), table(r.shared)].filter(t => t !== null && t !== undefined)) }))
    .filter(({ r, got }) => sorted(got) !== sorted(r.targets)).map(({ r, got }) => ({ xdg: r.xdg, shared: r.shared, got, want: r.targets }))
  expect(wrong).toEqual([])
})

// ── classify end to end, replayed against the scripted backend ────────────────

type Exchange = { request: string; reply?: string; fail?: string }
type Run = { task: string; context: string; facts: Record<string, unknown> | null; limits: string | null; mode: 'live' | 'shadow'
  exchanges: Exchange[]; result: Record<string, any> }

const FAILURES: Record<string, number> = { rate_limited: 429, auth_failed: 401 }

/** Each request answered as Python's transport answered the same body, its failures staged the same way. */
function replay(run: Run, sent: string[]): Host {
  let clock = 0
  return {
    env: async name => (name === 'TYPESAFE_API_KEY' ? 'parity-capture-key-0123456789' : name === 'XDG_CONFIG_HOME' ? '/cfg' : undefined),
    readFile: async () => undefined, secret: async () => undefined, home: async () => '/home/x',
    now: () => clock, sleep: async ms => { clock += ms },
    post: async (_url, body) => {
      sent.push(body)
      const exchange = run.exchanges.find(e => e.request === body)
      if (!exchange) throw new Error('unrecorded request')
      if (exchange.fail === 'timeout') { clock += 60_000; throw new Error('timeout') }
      if (exchange.fail && FAILURES[exchange.fail]) return { status: FAILURES[exchange.fail], text: '', headers: {} }
      if (exchange.fail) throw new Error(exchange.fail)
      return { status: 200, text: exchange.reply as string, headers: {} }
    },
  }
}

function fakeLimits(run: Run, charged: number[]): Limits {
  return {
    admit: async () => (run.limits === 'budget' ? [false, 'skipped_budget'] : [true, 'ok']),
    charge: async usd => { charged.push(usd) },
  }
}

test('classify sends the requests and reaches the lanes lanes.classify did', async () => {
  const wrong: unknown[] = []
  for (const [n, run] of (runs as unknown as Run[]).entries()) {
    const sent: string[] = []
    const charged: number[] = []
    const got = await classify(replay(run, sent), run.task, LANE, { context: run.context, facts: run.facts ?? undefined, mode: run.mode,
      limits: fakeLimits(run, charged) })
    const { latency_ms: _l, ...decision } = got.decision
    const diverges = LANE_DIVERGENCES[run.task]
    if (diverges) {
      if (diverges.port === 'refused') {
        // Python sent it; the port must refuse it before anything leaves.
        if (sent.length || decision.error !== 'sensitive_not_sent' || got.lane !== 'keep_current') wrong.push({ n, what: 'divergence', got, sent })
      } else if (!sent.length || sent.some(body => !body.includes(diverges.port.sent_with) || body.includes(diverges.port.not))) {
        // Sent masked. Python's reply was for the unmasked body, so here it goes unanswered (and is retried).
        wrong.push({ n, what: 'divergence', sent })
      }
      // Stale: Python already did what the port does.
      const python = run.exchanges.map(e => e.request).join('')
      if (diverges.port === 'refused' ? !run.exchanges.length : python.includes(diverges.port.sent_with)) wrong.push({ n, what: 'stale divergence' })
      continue
    }
    const { latency_ms: _w, policy: _p, state_sha256: _s, ...want } = run.result.decision
    if (sorted({ ...got, decision }) !== sorted({ ...run.result, decision: want })) {
      wrong.push({ n, task: run.task.slice(0, 60), got: { ...got, decision }, want: { ...run.result, decision: want } })
    }
    const expected = run.exchanges.map(e => e.request).sort()
    if (JSON.stringify([...sent].sort()) !== JSON.stringify(expected)) wrong.push({ n, what: 'requests', got: sent, want: expected })
    if (decision.status === 'ok' && JSON.stringify(charged) !== JSON.stringify([decision.cost_usd])) wrong.push({ n, what: 'charge', charged })
  }
  expect(wrong.slice(0, 3)).toEqual([])
  expect((runs as unknown[]).length).toBeGreaterThan(90)
})

// ── the budget's arithmetic (limits.py), on a fixed clock ──────────────────────

test('the budget admits within the minute and the day, stops shadow work first, and rolls over', () => {
  const noon = new Date(2026, 9, 8, 12, 0, 30).getTime()
  const config = limitConfig({ rpm: 10, daily_usd: 0.5, shadow_share: 0.5, extra: 1, rpm2: -1 })
  expect(config).toEqual({ rpm: 10, daily_usd: 0.5, shadow_share: 0.5 })
  expect(limitConfig({ rpm: -1, daily_usd: 'x' })).toEqual(LIMIT_DEFAULTS)
  let state = {}
  for (let i = 0; i < 5; i++) state = admitState(state, config, noon, true)[2]
  expect(admitState(state, config, noon, true).slice(0, 2)).toEqual([false, 'skipped_rate'])
  expect(admitState(state, config, noon, false).slice(0, 2)).toEqual([true, 'ok'])
  expect(admitState(state, config, noon + 60_000, true).slice(0, 2)).toEqual([true, 'ok'])
  state = chargeState(state, noon, 0.3)
  state = chargeState(state, noon, 0.2)
  expect(admitState(state, config, noon, false).slice(0, 2)).toEqual([false, 'skipped_budget'])
  const tomorrow = new Date(2026, 9, 9, 0, 0, 1).getTime()
  expect(admitState(state, config, tomorrow, false).slice(0, 2)).toEqual([true, 'ok'])
  expect(chargeState({}, noon, 0.1 + 0.2).usd).toBe(0.3)
})

test('an override that does not lint is refused, naming every problem', () => {
  const broken = LANE_POLICY_TEXT.replace('"otherwise": "medium"', '"otherwize": "medium"')
  expect(() => parse(broken, 'lane', 'override')).toThrow("policy 'lane': unknown keys ['otherwize']; otherwise must name an action")
  expect(() => parse('{', 'lane', 'override')).toThrow('lane.json could not be read as JSON')
  expect((parse(LANE_POLICY_TEXT, 'lane', 'backend') as Policy)._origin).toBe('backend')
})
