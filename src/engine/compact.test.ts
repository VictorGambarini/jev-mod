import { test, expect } from 'claude-code/testing'
import runs from '../../test/parity/fixtures/compact'
import convos from '../../test/parity/fixtures/compact_convos'
import type { Host } from './client'
import { select, type Message } from './compact'

type Exchange = { request: string; reply?: string; fail?: string }
type Run = { convo: string; keep_last: number; exchanges: Exchange[]; result: Record<string, unknown> }

const sorted = (value: unknown): string => JSON.stringify(value ?? null, (_, v) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v)

const FAILURES: Record<string, number> = { auth_failed: 401 }

/** Each request answered as Python's transport answered the same body, its failures staged the same way. */
function replay(run: Run, sent: string[]): Host {
  return {
    env: async name => (name === 'TYPESAFE_API_KEY' ? 'parity-capture-key-0123456789' : name === 'XDG_CONFIG_HOME' ? '/cfg' : undefined),
    readFile: async () => undefined, secret: async () => undefined, home: async () => '/home/x',
    now: () => 0, sleep: async () => {},
    post: async (_url, body) => {
      sent.push(body)
      const exchange = run.exchanges.find(e => e.request === body)
      if (!exchange) throw new Error('unrecorded request')
      if (exchange.fail && FAILURES[exchange.fail]) return { status: FAILURES[exchange.fail]!, text: '', headers: {} }
      if (exchange.fail) throw new Error(exchange.fail)
      return { status: 200, text: exchange.reply as string, headers: {} }
    },
  }
}

test('select sends the requests and reaches the fates compact.select did', async () => {
  const wrong: unknown[] = []
  for (const [n, run] of (runs as unknown as Run[]).entries()) {
    const sent: string[] = []
    const messages = (convos as unknown as Record<string, Message[]>)[run.convo]
    const { latency_ms: _l, calls: _c, ...got } = await select(replay(run, sent), messages!, { keepLast: run.keep_last })
    const { latency_ms: _w, ...want } = run.result
    if (sorted(got) !== sorted(want)) wrong.push({ n, convo: run.convo, got, want })
    // In order: batches go one after another, as Python sent them.
    const expected = run.exchanges.map(e => e.request)
    if (JSON.stringify(sent) !== JSON.stringify(expected)) wrong.push({ n, what: 'requests', got: sent.length, want: expected.length })
  }
  expect(wrong.slice(0, 3)).toEqual([])
  expect((runs as unknown[]).length).toBeGreaterThan(20)
})
