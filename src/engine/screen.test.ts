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
