import { test, expect } from 'claude-code/testing'
import convos from '../../test/parity/fixtures/compact_convos'
import type { Host } from './client'
import { select, FATE, type Message } from './compact'

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
    : i % 3 === 1 ? { choice: 'drop', confidence: 0.5 } : { choice: 'keep', confidence: 0.9 })), plain)
  expect(out.status).toBe('ok')
  for (let i = 0; i < FREE; i++) expect(out.fates[String(i)]).toBe(i % 3 === 0 ? 'drop' : 'keep')
  for (let i = FREE; i < 24; i++) expect(out.fates[String(i)]).toBe('keep')
  expect(out.counts).toEqual({ keep: 24 - 6, drop: 6 })
})

test('drop at exactly 0.7 is dropped, at 0.69 kept', async () => {
  const sure = await select(fake(() => ({ choice: 'drop', confidence: 0.9 })), plain)
  expect(sure.counts.drop).toBeGreaterThan(0)
  expect((await select(fake(() => ({ choice: 'drop', confidence: 0.7 })), plain)).counts).toEqual(sure.counts)
  expect((await select(fake(() => ({ choice: 'drop', confidence: 0.69 })), plain)).counts.drop).toBe(0)
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
