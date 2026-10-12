import { test, expect } from 'claude-code/testing'
import convos from '../../test/parity/fixtures/compact_convos'
import type { Host } from './client'
import { select, FATE, STATE_BUDGET, trim, TRIM_BATCH, TRIM_SHOWN, trimOptions, type Message, type TrimView } from './compact'

// Deliberately not a parity test: jev-skills' compact.select also offers "summarize"; here Jev is
// asked keep or drop only (docs/PORTING.md). The fake backend answers each question by `pick`.

type Pick = (index: number) => { choice: 'keep' | 'drop'; confidence: number } | 'omit'
type Body = { state: { turns: Record<string, string> }; questions: Record<string, { criteria: Record<string, string> }> }

function fake(pick: Pick, opts: { failFrom?: number; sent?: Body[] } = {}): Host {
  let calls = 0
  return {
    env: async name => (name === 'TYPESAFE_API_KEY' ? 'scratch-test-key-0123456789' : name === 'XDG_CONFIG_HOME' ? '/scratch-cfg' : undefined),
    readFile: async () => undefined, secret: async () => undefined, home: async () => '/home/x',
    now: () => 0, sleep: async () => {},
    post: async (_url, body) => {
      calls++
      if (opts.failFrom !== undefined && calls >= opts.failFrom) throw new Error('network')
      const parsed = JSON.parse(body) as Body
      opts.sent?.push(parsed)
      const answers: Record<string, unknown> = {}
      for (const name of Object.keys(parsed.questions)) {
        const p = pick(Number(name.slice(1)))
        if (p === 'omit') continue
        const other = p.choice === 'keep' ? 'drop' : 'keep'
        const rest = 1 - p.confidence
        answers[name] = { type: 'choice', choice: p.choice, confidence: p.confidence,
          probabilities: { [p.choice]: p.confidence, [other]: Math.round(rest * 1000) / 1000 } }
      }
      return { status: 200, text: JSON.stringify({ answers }), headers: {} }
    },
  }
}

const plain = (convos as unknown as Record<string, Message[]>).plain! // 24 turns; the last 6 are always kept
const FREE = 24 - 6

test('the question has exactly the criteria keep and drop', async () => {
  const sent: Body[] = []
  await select(fake(() => ({ choice: 'keep', confidence: 0.9 }), { sent }), plain)
  expect(sent.length).toBeGreaterThan(0)
  for (const body of sent) for (const q of Object.values(body.questions)) expect(Object.keys(q.criteria)).toEqual(['keep', 'drop'])
  expect(Object.keys(FATE)).toEqual(['keep', 'drop'])
  expect(FATE.keep).toContain('gist')
})

test('drop at 0.9 is dropped, drop at 0.5 is kept, keep is kept', async () => {
  const out = await select(fake(i => (i % 3 === 0 ? { choice: 'drop', confidence: 0.9 }
    : i % 3 === 1 ? { choice: 'drop', confidence: 0.5 } : { choice: 'keep', confidence: 0.9 })), plain, { dropConfidence: 0.7 })
  expect(out.status).toBe('ok')
  for (let i = 0; i < FREE; i++) expect(out.fates[String(i)]).toBe(i % 3 === 0 ? 'drop' : 'keep')
  for (let i = FREE; i < 24; i++) expect(out.fates[String(i)]).toBe('keep')
  expect(out.counts).toEqual({ keep: 24 - 6, drop: 6 })
})

test('drop at exactly 0.7 is dropped, at 0.69 kept (caller bar 0.7)', async () => {
  const opts = { dropConfidence: 0.7 }
  const sure = await select(fake(() => ({ choice: 'drop', confidence: 0.9 })), plain, opts)
  expect(sure.counts.drop).toBeGreaterThan(0)
  expect((await select(fake(() => ({ choice: 'drop', confidence: 0.7 })), plain, opts)).counts).toEqual(sure.counts)
  expect((await select(fake(() => ({ choice: 'drop', confidence: 0.69 })), plain, opts)).counts.drop).toBe(0)
})

test('the default drop bar is 0.5: drop at 0.5 is dropped, at 0.49 kept', async () => {
  const sure = await select(fake(() => ({ choice: 'drop', confidence: 0.9 })), plain)
  expect((await select(fake(() => ({ choice: 'drop', confidence: 0.5 })), plain)).counts).toEqual(sure.counts)
  expect((await select(fake(() => ({ choice: 'drop', confidence: 0.49 })), plain)).counts.drop).toBe(0)
})

test('a caller may move the drop bar (a bench run does): 0.8 keeps a 0.75 drop, 0.6 drops it', async () => {
  const at = (bar: number) => select(fake(() => ({ choice: 'drop', confidence: 0.75 })), plain, { dropConfidence: bar })
  expect((await at(0.8)).counts.drop).toBe(0)
  const sure = await select(fake(() => ({ choice: 'drop', confidence: 0.9 })), plain)
  expect((await at(0.6)).counts).toEqual(sure.counts)
  expect(sure.counts.drop).toBeGreaterThan(0)
})

test('Jev failing keeps everything, status fail_open', async () => {
  const out = await select(fake(() => ({ choice: 'drop', confidence: 0.9 }), { failFrom: 1 }), plain)
  expect(out.status).toBe('fail_open')
  expect(out.counts).toEqual({ keep: 24, drop: 0 })
  expect(out.unjudged.length).toBe(FREE)
})

test('a lost batch leaves its turns unjudged and kept', async () => {
  const long = (convos as unknown as Record<string, Message[]>).long!
  const out = await select(fake(() => ({ choice: 'drop', confidence: 0.9 }), { failFrom: 2 }), long)
  expect(out.status).toBe('partial')
  expect(out.unjudged.length).toBeGreaterThan(0)
  for (const i of out.unjudged) expect(out.fates[String(i)]).toBe('keep')
  expect(out.counts.drop).toBeGreaterThan(0)
  expect(out.counts.keep + out.counts.drop).toBe(long.length)
})

test('system turns, the tail and turns never sent stay kept', async () => {
  const messages: Message[] = [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'my password is hunter2, use it for the deploy' },
    ...Array.from({ length: 4 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `chatter ${i}` })),
    ...Array.from({ length: 6 }, (_, i) => ({ role: 'user', content: `tail ${i}` })),
  ]
  const out = await select(fake(() => ({ choice: 'drop', confidence: 0.95 })), messages)
  expect(out.fates['0']).toBe('keep')
  expect(out.fates['1']).toBe('keep')
  for (let i = 2; i < 6; i++) expect(out.fates[String(i)]).toBe('drop')
  for (let i = 6; i < 12; i++) expect(out.fates[String(i)]).toBe('keep')
})

test('a turn Jev left out of its answer is kept', async () => {
  const out = await select(fake(i => (i === 2 ? 'omit' : { choice: 'drop', confidence: 0.9 })), plain)
  expect(out.fates['2']).toBe('keep')
})

// ── trim ──

type TrimBody = { state: { results: Record<string, string> }; questions: Record<string, { instructions: string; criteria: Record<string, string> }> }
type Size = '0' | '100' | '300' | '600'

/** A fake that answers each trim question by `pick(view index, 'h' | 'e')`; `failFrom` fails that request and later ones. */
function trimFake(pick: (i: number, end: 'h' | 'e') => { choice: Size; confidence: number } | 'omit',
  opts: { failFrom?: number; sent?: TrimBody[] } = {}): Host {
  let calls = 0
  return {
    ...fake(() => 'omit'),
    post: async (_url, body) => {
      calls++
      if (opts.failFrom !== undefined && calls >= opts.failFrom) throw new Error('network')
      const parsed = JSON.parse(body) as TrimBody
      opts.sent?.push(parsed)
      const answers: Record<string, unknown> = {}
      for (const name of Object.keys(parsed.questions)) {
        const p = pick(Number(name.slice(1)), name[0] as 'h' | 'e')
        if (p === 'omit') continue
        const rest = Math.round((1 - p.confidence) * 1000) / 3000
        const probabilities = Object.fromEntries(['0', '100', '300', '600'].map(k => [k, k === p.choice ? p.confidence : rest]))
        answers[name] = { type: 'choice', choice: p.choice, confidence: p.confidence, probabilities }
      }
      return { status: 200, text: JSON.stringify({ answers }), headers: {} }
    },
  }
}

const view = (i: number, extra: Partial<TrimView> = {}): TrimView =>
  ({ tool: 'Bash', arg: `cat log${i}.txt`, size: 5000, isError: false, head: `head ${i} `.repeat(60), tail: `tail ${i} `.repeat(60), ...extra })

test('trim asks two questions per result, start and end, each with the options 0, 100, 300 and 600', async () => {
  const sent: TrimBody[] = []
  const out = await trim(trimFake((i, end) => ({ choice: end === 'h' ? '100' : '600', confidence: 0.9 }), { sent }), [view(0), view(1)])
  expect(out.status).toBe('ok')
  expect(out.trims).toEqual({ 0: { head: 100, tail: 600 }, 1: { head: 100, tail: 600 } })
  expect(Object.keys(sent[0]!.questions)).toEqual(['h0', 'e0', 'h1', 'e1'])
  for (const q of Object.values(sent[0]!.questions)) {
    expect(Object.keys(q.criteria)).toEqual(['0', '100', '300', '600'])
    expect(q.instructions).toContain('re-read the file')
  }
  expect(Object.keys(trimOptions('start'))).toEqual(['0', '100', '300', '600'])
  expect(sent[0]!.state.results.R0).toBe(`tool call Bash: cat log0.txt\nresult: 5000 characters\nstart: ${view(0).head}\nend: ${view(0).tail}`)
})

test('trim: an answer below the bar keeps all 600 of that end; the bar is the drop bar, 0.5 unless the caller moves it', async () => {
  const pick = (_i: number, end: 'h' | 'e') => (end === 'h' ? { choice: '0' as Size, confidence: 0.45 } : { choice: '100' as Size, confidence: 0.5 })
  expect((await trim(trimFake(pick), [view(0)])).trims['0']).toEqual({ head: TRIM_SHOWN, tail: 100 })
  expect((await trim(trimFake(pick), [view(0)], { confidence: 0.7 })).trims['0']).toEqual({ head: 600, tail: 600 })
})

test('trim: a failed request or a half answer leaves its results unjudged; none answered is fail_open', async () => {
  const views = Array.from({ length: TRIM_BATCH + 3 }, (_, i) => view(i))
  const partial = await trim(trimFake(() => ({ choice: '0', confidence: 0.9 }), { failFrom: 2 }), views)
  expect(partial.status).toBe('partial')
  expect(Object.keys(partial.trims)).toHaveLength(TRIM_BATCH)
  expect(partial.unjudged).toEqual([TRIM_BATCH, TRIM_BATCH + 1, TRIM_BATCH + 2])
  const down = await trim(trimFake(() => ({ choice: '0', confidence: 0.9 }), { failFrom: 1 }), views)
  expect([down.status, down.trims, down.unjudged.length]).toEqual(['fail_open', {}, views.length])
  const half = await trim(trimFake((i, end) => (i === 1 && end === 'e' ? 'omit' : { choice: '0', confidence: 0.9 })), [view(0), view(1)])
  expect(half.trims['1']).toBe(undefined)
  expect(half.unjudged).toContain(1)
})

test('trim packs requests by encoded size: wide text makes smaller batches, each within the state budget', async () => {
  const sent: TrimBody[] = []
  const wide = Array.from({ length: 12 }, (_, i) => view(i, { head: '漢'.repeat(TRIM_SHOWN), tail: '字'.repeat(TRIM_SHOWN) }))
  const out = await trim(trimFake(() => ({ choice: '300', confidence: 0.9 }), { sent }), wide)
  expect(out.status).toBe('ok')
  expect(sent.length).toBeGreaterThan(1)
  for (const body of sent) expect(JSON.stringify(body.state).replace(/[^\x00-\x7f]/g, '      ').length).toBeLessThanOrEqual(STATE_BUDGET + 200)
  expect(Object.keys(out.trims)).toHaveLength(12)
})

test('trim redacts what it sends: a key in a call or a result never leaves', async () => {
  const sent: TrimBody[] = []
  const key = `sk-${'A1b2C3d4'.repeat(4)}`
  await trim(trimFake(() => ({ choice: '0', confidence: 0.9 }), { sent }), [view(0, { arg: `curl -H ${key}`, tail: `token ${key}` })])
  expect(JSON.stringify(sent)).not.toContain(key)
})
