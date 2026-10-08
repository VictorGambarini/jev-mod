import { test, expect } from 'claude-code/testing'
import patterns from '../../test/parity/fixtures/screen_patterns'
import screened from '../../test/parity/fixtures/local_screen'
import screenedUnicode from '../../test/parity/fixtures/local_screen_unicode'
import web from '../../test/parity/fixtures/webscreen'
import webUnicode from '../../test/parity/fixtures/webscreen_unicode'
import { chunks, localScreen, PATTERN_SOURCES, units, withhold } from './screen'
import { dumps, floatRepr, loads } from './pyjson'

// jev-skills' rerank.local_screen and webscreen.py, captured (docs/PORTING.md), must give the
// same answers here: on its test corpus, and on a Unicode set aimed at code-point windows,
// accented neighbours and Python's JSON formatting.

test('every pattern is copied from Python exactly', () => {
  expect(PATTERN_SOURCES).toEqual(patterns as Record<string, string>)
})

type Screened = { text: string; screen: string; unvetted: string }
for (const [name, cases] of [['corpus', screened], ['Unicode set', screenedUnicode]] as const) {
  test(`localScreen matches rerank.local_screen on the ${name}`, () => {
    const wrong = (cases as Screened[]).flatMap((c, i) => {
      const got = { screen: localScreen(c.text), unvetted: localScreen(c.text, true) }
      return got.screen === c.screen && got.unvetted === c.unvetted
        ? [] : [{ i, text: c.text.slice(0, 160), got, want: { screen: c.screen, unvetted: c.unvetted } }]
    })
    expect(wrong).toEqual([])
  })
}

type Chunked = { text: string; chunks: string[] }
type Units = { tool: string; raw: boolean; text: string; units?: [(string | number)[], string][]; flagged?: number[]
  error?: string; withheld: string | null }
type Web = { chunks: Chunked[]; units: Units[] }

for (const [name, fixture] of [['corpus', web], ['Unicode set', webUnicode]] as const) {
  const data = fixture as unknown as Web
  test(`chunks matches webscreen.chunks on the ${name}`, () => {
    const wrong = data.chunks.flatMap((c, i) => {
      const got = chunks(c.text)
      return JSON.stringify(got) === JSON.stringify(c.chunks) ? [] : [{ i, got: got.map(x => [...x].length), want: c.chunks.map(x => [...x].length) }]
    })
    expect(wrong).toEqual([])
  })
  test(`units and withhold match webscreen on the ${name}`, () => {
    const wrong = data.units.flatMap((c, i) => {
      let got: unknown
      try { got = units(c.tool, c.text, c.raw)[1] } catch { got = 'raised' }
      const want = c.error ? 'raised' : c.units
      const withheld = withhold(c.tool, c.text, { flagged: c.flagged ?? [0] })
      const bad = []
      if (JSON.stringify(got) !== JSON.stringify(want)) bad.push({ i, what: 'units', got, want })
      if (withheld !== c.withheld) bad.push({ i, what: 'withheld', got: withheld, want: c.withheld })
      return bad
    })
    expect(wrong).toEqual([])
  })
}

test('floats print as Python prints them', () => {
  const cases: [number, string][] = [[1, '1.0'], [1.5, '1.5'], [1e-5, '1e-05'], [0.0001, '0.0001'], [1e16, '1e+16'],
    [1e15, '1000000000000000.0'], [123456789.125, '123456789.125'], [-0, '-0.0'], [0.1 + 0.2, '0.30000000000000004'],
    [1.5e300, '1.5e+300'], [NaN, 'NaN'], [-Infinity, '-Infinity'], [2.5e-7, '2.5e-07']]
  expect(cases.map(([x]) => floatRepr(x))).toEqual(cases.map(([, s]) => s))
})

test('JSON round-trips as Python writes it: order, big integers, floats', () => {
  const text = '{"z": 1, "2": 2.0, "a": [1E+2, 12345678901234567890, -0, NaN], "z": 3, "s": "\\u00e9\\ud83d\\ude00\\u0007"}'
  expect(dumps(loads(text))).toBe('{\n  "z": 3,\n  "2": 2.0,\n  "a": [\n    100.0,\n    12345678901234567890,\n    0,\n    NaN\n  ],\n  "s": "é😀\\u0007"\n}')
})

// ── web screening end to end, against the scripted backend jev-skills tested with ──
import screens from '../../test/parity/fixtures/webscreen_screen'
import { screenResult, withholdText } from './screen'
import type { Host } from './client'

type Screen = { tool: string; text: string; raw: boolean; values: Record<string, number>; fail: string | null; send?: boolean
  bodies: string[]; verdict: Record<string, unknown>; screen_text: { text: string; flagged: number } | null }

const FAIL_STATUS: Record<string, number> = { timeout: 0 }
const sorted = (value: unknown): string => JSON.stringify(value ?? null, (_, v) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1))) : v)

/** The scripted backend: each noul answered from `values`, 0.05 otherwise, as _decide_fakes.Scripted does. */
function scripted(c: Screen, bodies: string[]): Host {
  return {
    env: async name => (name === 'TYPESAFE_API_KEY' ? 'parity-capture-key-0123456789' : name === 'XDG_CONFIG_HOME' ? '/cfg' : undefined),
    readFile: async () => undefined, secret: async () => undefined, home: async () => '/home/x',
    now: () => 0, sleep: async () => {},
    post: async (_url, body) => {
      bodies.push(body)
      if (c.fail === 'network') throw new Error('network')
      if (c.fail) return { status: FAIL_STATUS[c.fail] ?? 500, text: '', headers: {} }
      const questions = JSON.parse(body).questions as Record<string, unknown>
      const answers = Object.fromEntries(Object.keys(questions).map(name => [name, { type: 'noul', noul: c.values[name] ?? 0.05 }]))
      return { status: 200, text: JSON.stringify({ answers, usage: { input_tokens: 500, output_tokens: 20 }, model: 'jev-1.13.0' }), headers: {} }
    },
  }
}

test('screening sends, judges and withholds as webscreen.screen and hooks.screen_text did', async () => {
  const wrong: unknown[] = []
  for (const [n, c] of (screens as unknown as Screen[]).entries()) {
    // The Python capture's "timeout" was raised by the transport; here a host that never
    // answers in time is a network failure, so that case is checked for its local half only.
    const bodies: string[] = []
    const verdict = await screenResult(scripted(c, bodies), c.tool, c.text, { raw: c.raw, send: c.send ?? true, backend: null })
    const { calls: _c, errors: _e, latency_ms: _l, ...got } = verdict
    const { latency_ms: _w, ...want } = c.verdict
    // An outage's label: the capture's transport raised "timeout" itself, which a real host
    // reports as a network failure in both versions.
    const fold = (v: Record<string, unknown>) => sorted({ ...v, reason: v.reason === undefined ? undefined
      : String(v.reason).replace(/\((?:http_\d+|timeout|network)\)/, '(outage)') })
    if (fold(got) !== fold(want)) wrong.push({ n, what: 'verdict', got, want })
    if (c.fail !== 'timeout' && JSON.stringify([...bodies].sort()) !== JSON.stringify(c.bodies)) {
      wrong.push({ n, what: 'bodies', got: bodies.map(b => b.slice(0, 200)), want: c.bodies.map(b => b.slice(0, 200)) })
    }
    const text = withholdText(c.tool, c.text, c.raw, verdict)
    const out = c.send === false || text === null ? null : { text, flagged: verdict.flagged.length }
    if (sorted(out) !== sorted(c.screen_text)) wrong.push({ n, what: 'screen_text', got: out, want: c.screen_text })
  }
  expect(wrong).toEqual([])
})
