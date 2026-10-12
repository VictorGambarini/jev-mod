import { test, expect } from 'claude-code/testing'
import type { FetchInit, IO } from '../../core/io'
import { readLedger } from '../../bench/task-rows'
import { compact, isOurs, MARK } from './index'

// /jev-mod compact end to end with a fake IO: a fake decision backend answers each keep-or-drop
// question by the text it asks about, and each trim question by the result it asks about, and
// records every request. Files go to a fake disk. No real key, no real config.

type Fate = { choice: 'keep' | 'drop'; confidence: number }
type Size = { choice: '0' | '100' | '300' | '600'; confidence: number }
type Body = { state: { turns?: Record<string, string>; results?: Record<string, string> }; questions: Record<string, unknown> }
type Fake = IO & { asked: Body[]; disk: Record<string, string>; ran: string[][]; toasts: string[] }

function io(judge: (turn: string) => Fate, size: (result: string, end: 'h' | 'e') => Size = () => ({ choice: '0', confidence: 0.9 }),
  backend: 'up' | 'down' = 'up', failFrom = Infinity, pair: (result: string) => Fate = () => ({ choice: 'keep', confidence: 0.9 })): Fake {
  const store: Record<string, unknown> = {}
  const asked: Body[] = []
  const disk: Record<string, string> = {}
  const ran: string[][] = []
  const toasts: string[] = []
  const env: Record<string, string> = { JEV_HOME: '/jev', JEV_LIMITS: 'off', XDG_CONFIG_HOME: '/scratch-cfg', TYPESAFE_API_KEY: 'test-not-a-key' }
  return {
    asked, disk, ran, toasts,
    option: () => undefined,
    readFile: async (path: string) => { if (path in disk) return disk[path]!; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { disk[path] = text },
    folders: async () => [],
    files: async () => [],
    env: async (name: string) => env[name],
    home: async () => '/home/u',
    run: async (argv: string[]) => { ran.push(argv); return { exitCode: 0, stdout: '', stderr: '' } },
    // retries' back-off passes at once; a request's deadline never comes
    sleep: (ms: number) => (ms >= 5000 ? new Promise<void>(() => {}) : Promise.resolve()),
    sessionId: async () => 's1',
    storeGet: async (key: string) => store[key],
    storeSet: async (key: string, value: unknown) => { store[key] = value },
    status: () => {}, toast: (t: string) => { toasts.push(t) },
    fetch: async (_url: string, init?: FetchInit) => {
      if (backend === 'down' || asked.length + 1 >= failFrom) return { status: 503, ok: false, text: '' }
      const body = JSON.parse(init!.body!) as Body
      asked.push(body)
      const answers: Record<string, unknown> = {}
      for (const q of Object.keys(body.questions)) {
        if (body.state.turns) {
          const fate = judge(body.state.turns[`T${q.slice(1)}`]!)
          const other = fate.choice === 'keep' ? 'drop' : 'keep'
          answers[q] = { type: 'choice', choice: fate.choice, confidence: fate.confidence,
            probabilities: { [fate.choice]: fate.confidence, [other]: Math.round((1 - fate.confidence) * 1000) / 1000 } }
        } else if (q[0] === 'k') {
          const fate = pair(body.state.results![`R${q.slice(1)}`]!)
          const other = fate.choice === 'keep' ? 'drop' : 'keep'
          answers[q] = { type: 'choice', choice: fate.choice, confidence: fate.confidence, probabilities: { [fate.choice]: 0.9, [other]: 0.1 } }
        } else {
          const s = size(body.state.results![`R${q.slice(1)}`]!, q[0] as 'h' | 'e')
          answers[q] = { type: 'choice', choice: s.choice, confidence: s.confidence,
            probabilities: Object.fromEntries(['0', '100', '300', '600'].map(k => [k, k === s.choice ? 0.7 : 0.1])) }
        }
      }
      return { status: 200, ok: true, text: JSON.stringify({ answers, model: 'jev-test', usage: { input_tokens: 100 } }) }
    },
  } as unknown as Fake
}

const SECRET = `ghp_${'Zx9y'.repeat(9)}`
const LOG = `== app log ==\n${Array.from({ length: 200 }, (_, i) => `line ${i}: request ok`).join('\n')}\n== 2 errors ==`
const m = (role: string, text: string, extra: object = {}) => ({ role, text, toolUses: [], ...extra })
const use = (id: string, command: string) => ({ tool_use_id: id, tool: 'Bash', input: { command } })
const res = (id: string, text: string) => ({ tool_use_id: id, text, isError: false })

const convo = () => [
  m('user', 'fix the failing test', { handle: 'h0' }),                                          // 0
  m('assistant', 'Let me run the tests', { toolUses: [use('t1', 'npm test')], handle: 'h1' }),   // 1
  m('user', '', { toolResults: [res('t1', 'FAIL src/a.test.ts\nexpected 2, got 3')], handle: 'h2' }), // 2: short, whole
  m('assistant', '', { toolUses: [use('t2', 'cat app.log')], handle: 'h3' }),                     // 3
  m('user', '', { toolResults: [res('t2', LOG)], handle: 'h4' }),                                 // 4: trimmed
  m('assistant', '', { toolUses: [use('t3', 'env')], handle: 'h5' }),                             // 5
  m('user', '', { toolResults: [res('t3', `${LOG}\nGITHUB_TOKEN=${SECRET}`)], handle: 'h6' }),    // 6: sensitive, whole
  m('assistant', 'ok, noted'),                                                                  // 7
  ...Array.from({ length: 6 }, (_, i) => m(i % 2 ? 'assistant' : 'user', `tail ${i}`)),           // 8..13
]
type Out = Awaited<ReturnType<typeof compact>>
const body = (out: Out) => ('messages' in out ? out.messages.slice(1) : [])
const callOf = (out: Out, id: string) => body(out).flatMap((x: any) => x.toolUses ?? []).find((u: any) => u.tool_use_id === id)
const resultText = (out: Out, id: string) =>
  body(out).flatMap((x: any) => x.toolResults ?? []).find((r: any) => r.tool_use_id === id)?.text as string | undefined
const DIR = '/home/u/.cache/jev-mod/compact/s1'

test('Jev down: nothing is removed or trimmed, and no file is written', async () => {
  const fake = io(() => ({ choice: 'drop', confidence: 0.99 }), undefined, 'down')
  expect(await compact(fake, convo())).toEqual({ skip: 'Jev did not answer; nothing was removed' })
  expect(Object.keys(fake.disk).filter(p => p.startsWith(DIR))).toEqual([])
})

test('a long result is trimmed to what Jev keeps, saved in full first; the call, short and sensitive results stay whole', async () => {
  const messages = convo()
  const fake = io(() => ({ choice: 'keep', confidence: 0.9 }), (_r, end) => (end === 'h' ? { choice: '100', confidence: 0.9 } : { choice: '300', confidence: 0.9 }))
  const out = await compact(fake, messages)
  expect('messages' in out).toBe(true)
  // every message stays (texts were judged keep); only message 4 is rebuilt, without its handle
  expect(body(out)).toHaveLength(messages.length)
  body(out).forEach((x: any, i: number) => { if (i !== 4) expect(x).toBe(messages[i]) })
  expect(body(out)[4].handle).toBe(undefined)
  const file = `${DIR}/t2.txt`
  const text = resultText(out, 't2')!
  expect(text.startsWith(`${LOG.slice(0, 100)}\n[jev-mod compact trimmed this Bash (cat app.log) result: `)).toBe(true)
  expect(text).toContain(`keeping its first 100 and last 300. The full call and result are in ${file}; Read it if you need the rest.]`)
  expect(text.endsWith(`\n${LOG.slice(-300)}`)).toBe(true)
  expect(fake.disk[file]).toContain(`input:\n{\n  "command": "cat app.log"\n}`)
  expect(fake.disk[file]!.endsWith(LOG)).toBe(true)
  // the folder is made 0700 before the file is written, the file 0600 after
  expect(fake.ran[0]).toEqual(['mkdir', '-p', '-m', '700', DIR])
  expect(fake.ran[1]).toEqual(['chmod', '700', '/home/u/.cache/jev-mod/compact', DIR])
  expect(fake.ran[2]).toEqual(['chmod', '600', '--', file])
  expect(resultText(out, 't1')).toBe('FAIL src/a.test.ts\nexpected 2, got 3')
  expect(resultText(out, 't3')).toContain(SECRET) // never sent, so never judged: left whole, and not saved
  expect(Object.keys(fake.disk).filter(p => p.startsWith(DIR))).toEqual([file])
  // the secret result was never sent, nor the tail
  const sent = JSON.stringify(fake.asked)
  expect(sent).not.toContain(SECRET)
  expect(sent).not.toContain('tail 0')
  const note = (out as { messages: any[] }).messages[0].text as string
  expect(note).toContain('It trimmed 1 old tool results')
  expect(note).toContain(DIR)
  expect(note).toContain('nothing was summarised')
  expect(fake.toasts.at(-1)).toContain('trimmed 1 tool results')
})

test('a confident drop takes a text-only message; a message with a tool call stays with its text', async () => {
  const messages = convo()
  const fake = io(() => ({ choice: 'drop', confidence: 0.9 }), () => ({ choice: '600', confidence: 0.9 }))
  const out = await compact(fake, messages)
  // 0 and 7 are text only and go; 1 (narration with a call) is never sent and stays; 600+600 still cuts the long log
  expect(body(out).map((x: any) => messages.indexOf(x)).filter((i: number) => i >= 0)).toEqual([1, 2, 3, 5, 6, 8, 9, 10, 11, 12, 13])
  expect(resultText(out, 't2')).toContain('keeping its first 600 and last 600')
  const turns = fake.asked.flatMap(b => Object.values(b.state.turns ?? {}))
  expect(turns).toEqual(['user: fix the failing test', 'assistant: ok, noted'])
})

test('a pair Jev confidently drops goes whole, call and result, saved first; the note names the folder', async () => {
  const messages = convo()
  // the npm test pair (short: keep or drop only) and the log pair are dropped; texts are kept
  const fake = io(() => ({ choice: 'keep', confidence: 0.9 }), undefined, 'up', Infinity, () => ({ choice: 'drop', confidence: 0.8 }))
  const out = await compact(fake, messages)
  expect(callOf(out, 't1')).toBe(undefined)
  expect(resultText(out, 't1')).toBe(undefined)
  expect(callOf(out, 't2')).toBe(undefined)
  expect(resultText(out, 't2')).toBe(undefined)
  expect(resultText(out, 't3')).toContain(SECRET) // never sent: whole
  // 1 keeps its narration (rebuilt without the call); 2, 3 and 4 held only the dropped pairs and go
  const kept = body(out)
  expect(kept.map((x: any) => messages.indexOf(x))).toEqual([0, -1, 5, 6, 7, 8, 9, 10, 11, 12, 13])
  expect(kept[1]).toEqual({ role: 'assistant', text: 'Let me run the tests', toolUses: [] })
  expect(Object.keys(fake.disk).filter(p => p.startsWith(DIR)).sort()).toEqual([`${DIR}/t1.txt`, `${DIR}/t2.txt`])
  expect(fake.disk[`${DIR}/t1.txt`]).toContain('FAIL src/a.test.ts\nexpected 2, got 3')
  const note = (out as { messages: any[] }).messages[0].text as string
  expect(note).toContain('It dropped 2 old tool calls with their results')
  expect(note).toContain(`one file per call named by its tool_use_id, in ${DIR}`)
  // a drop below the bar keeps the pair, trimmed as answered
  const unsure = io(() => ({ choice: 'keep', confidence: 0.9 }), undefined, 'up', Infinity, () => ({ choice: 'drop', confidence: 0.4 }))
  const kept2 = await compact(unsure, convo())
  expect(callOf(kept2, 't2')).toEqual(use('t2', 'cat app.log'))
  expect(resultText(kept2, 't2')).toContain('keeping none of it')
  expect(resultText(kept2, 't1')).toBe('FAIL src/a.test.ts\nexpected 2, got 3')
})

test('a bench run counts dropped pairs', async () => {
  const fake = benched(io(() => ({ choice: 'keep', confidence: 0.9 }), undefined, 'up', Infinity,
    r => (r.includes('npm test') ? { choice: 'drop', confidence: 0.9 } : { choice: 'keep', confidence: 0.9 })))
  await compact(fake, convo())
  expect(ledgerOf(fake.disk).compaction).toMatchObject({ messages: 14, kept: 13, dropped: 1, pairsDropped: 1, trimmed: 1, files: 2 })
})

test('doubt keeps more: a low-confidence size keeps 600 of that end; an unjudged result stays whole', async () => {
  const lowHead = io(() => ({ choice: 'keep', confidence: 0.9 }), (_r, end) => (end === 'h' ? { choice: '0', confidence: 0.3 } : { choice: '0', confidence: 0.9 }))
  expect(resultText(await compact(lowHead, convo()), 't2')).toContain('keeping its first 600.')
  // the trim request fails (the second request), the keep-or-drop one answered keep: nothing to remove
  const lost = io(() => ({ choice: 'keep', confidence: 0.9 }), undefined, 'up', 2)
  expect(await compact(lost, convo())).toEqual({ skip: 'Jev marked nothing to drop or trim; nothing to remove' })
  expect(Object.keys(lost.disk).filter(p => p.startsWith(DIR))).toEqual([])
})

test('a result whose file cannot be made private is left whole', async () => {
  const fake = io(() => ({ choice: 'keep', confidence: 0.9 }))
  fake.run = async () => ({ exitCode: 1, stdout: '', stderr: 'denied' })
  expect(await compact(fake, convo())).toEqual({ skip: 'Jev marked nothing to drop or trim; nothing to remove' })
})

test('a private profile sends nothing and removes nothing', async () => {
  const fake = io(() => ({ choice: 'drop', confidence: 0.99 }))
  fake.option = (name: string) => (name === 'private' ? true : undefined)
  expect(await compact(fake, convo())).toEqual({ skip: 'this profile is private, so nothing is sent; nothing was removed' })
  expect(fake.asked).toHaveLength(0)
})

test('a /compact with the marker is ours when typed or sent headless; never a subagent\'s or an automatic one', () => {
  expect(isOurs({ trigger: 'manual', instructions: MARK })).toBe(true)
  expect(isOurs({ trigger: 'manual', instructions: `${MARK} and more` })).toBe(true)
  expect(isOurs({ trigger: 'manual', instructions: 'keep the plan' })).toBe(false)
  expect(isOurs({ trigger: 'manual' })).toBe(false)
  expect(isOurs({ trigger: 'auto', instructions: MARK })).toBe(false)
  expect(isOurs({ trigger: 'manual', instructions: MARK, agentId: 'a1' })).toBe(false)
})

// a bench run: the overlay names a ledger folder; each compaction writes what it did there, and its files go under it
function benched(fake: Fake): Fake {
  fake.disk['/scratch/overlay.json'] = JSON.stringify({ ledger: '/scratch/ledger' })
  const env = fake.env
  return Object.assign(fake, { env: async (name: string) => (name === 'JEV_MOD_BENCH_OVERLAY' ? '/scratch/overlay.json' : env(name)) })
}
const ledgerOf = (disk: Record<string, string>) =>
  readLedger(Object.entries(disk).filter(([p]) => /^\/scratch\/ledger\/[^/]+$/.test(p)).map(([p, text]) => ({ name: p.split('/').pop()!, text })))

test('a bench run records what the compaction dropped and trimmed, and saves its files in the run\'s folder', async () => {
  const fake = benched(io(t => (t.includes('noted') ? { choice: 'drop', confidence: 0.9 } : { choice: 'keep', confidence: 0.9 })))
  const out = await compact(fake, convo())
  expect('messages' in out).toBe(true)
  const removed = LOG.length - resultText(out, 't2')!.length
  expect(ledgerOf(fake.disk).compaction).toEqual({ messages: 14, kept: 13, dropped: 1, pairsDropped: 0, trimmed: 1, charsRemoved: removed, files: 1, skip: null })
  expect(Object.keys(fake.disk).filter(p => p.startsWith('/scratch/ledger/compact-files/s1/'))).toEqual(['/scratch/ledger/compact-files/s1/t2.txt'])
  expect(Object.keys(fake.disk).some(p => p.startsWith('/home/u/.cache'))).toBe(false)
  const down = benched(io(() => ({ choice: 'drop', confidence: 0.99 }), undefined, 'down'))
  await compact(down, convo())
  expect(ledgerOf(down.disk).compaction).toEqual({ messages: 14, kept: 14, dropped: 0, pairsDropped: 0, trimmed: 0, charsRemoved: 0, files: 0,
    skip: 'Jev did not answer; nothing was removed' })
  // the decisions are counted apart from the compaction: one file for the keep-or-drop requests, one for the trim
  // requests, failed ones too
  expect(ledgerOf(fake.disk).decisions).toBe(2)
  expect(ledgerOf(fake.disk).calls).toBe(fake.asked.length)
  expect(ledgerOf(down.disk).decisions).toBe(2)
})
