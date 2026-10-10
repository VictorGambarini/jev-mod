import { test, expect } from 'claude-code/testing'
import { fileName, fromLines, toLine, unsafe } from './results'
import type { Row } from './types'

function sampleRow(over: Partial<Row> = {}): Row {
  return {
    schema: 1, run: '2026-10-11T10:00:00.000Z-abc123', feature: 'compact', level: 'decision', jevmod: '0.10.0',
    git: 'f040686a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e-dirty', date: '2026-10-11T10:00:00.000Z',
    backend: { name: 'laya', kind: 'named', model: 'laya' }, answered_model: 'laya-0.4.2', settings: { maxChangeChars: 6000 },
    sweep: 'drop=0.5:0.95:0.05', case: 'retry-backoff', outcome: 'ok',
    items: [{ id: 'm0', gold: false, score: null }, { id: 'ptoolu_0001', gold: true, score: 0.82 }],
    detail: { scores: [null, 0.82] }, calls: 1, latencies_ms: [412], input_tokens: 1830, cost_usd: 0.0000769,
    ...over,
  }
}

test('a row survives the JSONL round trip unchanged', () => {
  const rows = [sampleRow(), sampleRow({ case: 'db-migration-enum', outcome: 'error', error: 'timeout', items: [], calls: 1, latencies_ms: [] })]
  const text = rows.map(toLine).join('\n') + '\n'
  const back = fromLines(text)
  expect(back.skipped).toBe(0)
  expect(back.rows).toEqual(rows)
})

test('lines that are not rows are passed over and counted', () => {
  const text = [toLine(sampleRow()), 'not json', '{"schema": 2, "feature": "x", "case": "y"}', '', '{}'].join('\n')
  const back = fromLines(text)
  expect(back.rows).toHaveLength(1)
  expect(back.skipped).toBe(3)
})

test('a row naming a key or a header, or holding a secret-shaped value, is never written', () => {
  expect(() => toLine(sampleRow({ settings: { api_key: 'x' } }))).toThrow()
  expect(() => toLine({ ...sampleRow(), detail: { headers: { a: 1 } } })).toThrow()
  expect(() => toLine(sampleRow({ error: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456' }))).toThrow()
  expect(unsafe(sampleRow({ detail: { note: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789' } }))).not.toBe(null)
  // counts and a case id that only mentions a key are fine; the git sha is a stamp, not text
  expect(unsafe(sampleRow({ case: 'logs-api-key-reference' }))).toBe(null)
})

test('file names carry level, backend and date, and "fake" for the fake backend', () => {
  expect(fileName('2026-10-11T10:00:00.000Z', 'decision', 'laya', false)).toBe('decision-laya-2026-10-11T10-00-00-000.jsonl')
  expect(fileName('2026-10-11T10:00:00.000Z', 'decision', 'fake', true)).toBe('decision-fake-2026-10-11T10-00-00-000.fake.jsonl')
  expect(fileName('2026-10-11T10:00:00.000Z', 'task', 'typesafe+laya', false)).toBe('task-typesafe_laya-2026-10-11T10-00-00-000.jsonl')
})
