import { test, expect } from 'claude-code/testing'
import type { FetchInit, IO } from '../../core/io'
import { compact } from './index'

// /jev-mod compact end to end with a fake IO: a fake decision backend answers each question by
// what the unit it asks about says, and records every request. No real key, no real config.

type Fate = { choice: 'keep' | 'drop'; confidence: number }
type Fake = IO & { asked: { state: { turns: Record<string, string> }; questions: Record<string, unknown> }[] }

function io(judge: (turn: string) => Fate, backend: 'up' | 'down' = 'up', failFrom = Infinity): Fake {
  const store: Record<string, unknown> = {}
  const asked: Fake['asked'] = []
  const env: Record<string, string> = { JEV_HOME: '/jev', JEV_LIMITS: 'off', XDG_CONFIG_HOME: '/scratch-cfg', TYPESAFE_API_KEY: 'test-not-a-key' }
  return {
    asked,
    option: () => undefined,
    readFile: async () => { throw new Error('ENOENT') },
    writeFile: async () => {},
    env: async (name: string) => env[name],
    home: async () => '/home/u',
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
    // retries' back-off passes at once; a request's deadline never comes
    sleep: (ms: number) => (ms >= 5000 ? new Promise<void>(() => {}) : Promise.resolve()),
    sessionId: async () => 's1',
    storeGet: async (key: string) => store[key],
    storeSet: async (key: string, value: unknown) => { store[key] = value },
    status: () => {}, toast: () => {},
    fetch: async (_url: string, init?: FetchInit) => {
      if (backend === 'down' || asked.length + 1 >= failFrom) return { status: 503, ok: false, text: '' }
      const body = JSON.parse(init!.body!)
      asked.push(body)
      const answers: Record<string, unknown> = {}
      for (const q of Object.keys(body.questions)) {
        const fate = judge(body.state.turns[`T${q.slice(1)}`])
        const other = fate.choice === 'keep' ? 'drop' : 'keep'
        answers[q] = { type: 'choice', choice: fate.choice, confidence: fate.confidence,
          probabilities: { [fate.choice]: fate.confidence, [other]: Math.round((1 - fate.confidence) * 1000) / 1000 } }
      }
      return { status: 200, ok: true, text: JSON.stringify({ answers, model: 'jev-test', usage: { input_tokens: 100 } }) }
    },
  } as unknown as Fake
}

const SECRET = `ghp_${'Zx9y'.repeat(9)}`
const m = (role: string, text: string, extra: object = {}) => ({ role, text, toolUses: [], ...extra })
const use = (id: string, command: string) => ({ tool_use_id: id, tool: 'Bash', input: { command } })
const res = (id: string, text: string) => ({ tool_use_id: id, text, isError: false })

const convo = () => [
  m('user', 'fix the failing test'),                                                             // 0
  m('assistant', 'Let me run the tests', { toolUses: [use('t1', 'npm test')] }),                // 1
  m('user', '', { toolResults: [res('t1', 'FAIL src/a.test.ts\nexpected 2, got 3')] }),          // 2
  m('assistant', '', { toolUses: [use('t2', 'ls')] }),                                          // 3
  m('user', '', { toolResults: [res('t2', `a.ts b.ts\nleftover ${SECRET} in old output`)] }),     // 4
  m('assistant', '', { toolUses: [use('t3', 'cat notes.txt')] }),                               // 5
  m('user', '', { toolResults: [res('t3', 'nothing useful here')] }),                            // 6
  ...Array.from({ length: 6 }, (_, i) => m(i % 2 ? 'assistant' : 'user', `tail ${i}`)),           // 7..12
]
const indexes = (out: Awaited<ReturnType<typeof compact>>, messages: object[]) =>
  'messages' in out ? out.messages.slice(1).map(x => messages.indexOf(x)) : out.skip

test('Jev down: nothing is removed, tool pairs included', async () => {
  const messages = convo()
  const out = await compact(io(() => ({ choice: 'drop', confidence: 0.99 }), 'down'), messages)
  expect(out).toEqual({ skip: 'Jev did not answer; nothing was removed' })
})

test('a partial answer: the pairs in the batch that failed are kept, whole', async () => {
  const filler = Array.from({ length: 40 }, (_, i) => m(i % 2 ? 'assistant' : 'user', `ok ${i}`))
  const messages = [...filler, ...convo()]
  const fake = io(() => ({ choice: 'drop', confidence: 0.95 }), 'up', 2) // the second request fails
  const out = await compact(fake, messages)
  expect(fake.asked.length).toBe(1)
  expect(indexes(out, messages)).toEqual(Array.from({ length: 13 }, (_, i) => 40 + i))
})

test('tool pairs are judged: a confident drop takes the pair whole, a keep and an unjudged pair stay', async () => {
  const messages = convo()
  // narration and the cat pair: drop; the npm test pair: keep; the ls pair holds a token: never sent
  const fake = io(turn => (turn.includes('npm test') ? { choice: 'keep', confidence: 0.9 } : { choice: 'drop', confidence: 0.9 }))
  const out = await compact(fake, messages)
  expect(indexes(out, messages)).toEqual([1, 2, 3, 4, 7, 8, 9, 10, 11, 12])
  if ('messages' in out) expect(out.messages[0]!.text).toContain('A tool call and its result were judged together')
})

test('a low-confidence drop of a pair keeps it whole', async () => {
  const messages = convo()
  const fake = io(turn => (turn.includes('cat notes') ? { choice: 'drop', confidence: 0.69 }
    : turn.includes('npm test') ? { choice: 'keep', confidence: 0.6 } : { choice: 'drop', confidence: 0.95 }))
  expect(indexes(await compact(fake, messages), messages)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
})

test('the request holds the redacted tool summary and never a secret from a tool result', async () => {
  const messages = convo()
  messages[6] = m('user', '', { toolResults: [res('t3', 'mail me at bob@example.com when done')] })
  const fake = io(() => ({ choice: 'keep', confidence: 0.9 }))
  await compact(fake, messages)
  const sent = JSON.stringify(fake.asked)
  const turns = fake.asked.flatMap(b => Object.values(b.state.turns))
  expect(turns).toContain('tool: tool call Bash: npm test\nresult: FAIL src/a.test.ts\nexpected 2, got 3')
  expect(turns).toContain('tool: tool call Bash: cat notes.txt\nresult: mail me at [email] when done')
  expect(sent).not.toContain(SECRET)
  expect(sent).not.toContain('bob@example.com')
  expect(sent).not.toContain('tail 0') // the tail is kept without asking
})
