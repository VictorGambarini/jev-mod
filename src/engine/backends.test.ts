import { test, expect } from 'claude-code/testing'
import { isLocal, parse } from './backends'
import {
  ask, checkAnswer, choice, JevError, jevConfidence, loadingPauseMs, noul, pinnedWarning, resetSeen, score, seenBackend,
  warnings, type Host,
} from './client'

// Named backends other than Jev: each fake server below answers the way that server computes
// its numbers (Laya's entropy confidence, Kev's, Von's clamped yes/no), or cuts, refuses or is
// still loading. Every key is a made-up placeholder; nothing here reaches the network.

type Reply = { status?: number; text?: string; headers?: Record<string, string>; raise?: boolean }
type Sent = { url: string; headers: Record<string, string>; timeoutMs: number }

function fake(backend: Record<string, unknown>, replies: Reply[] | ((body: any) => Reply), env: Record<string, string> = {}) {
  const config = JSON.stringify({ default: 'mine', backends: { mine: backend } })
  const all: Record<string, string> = { ...env, XDG_CONFIG_HOME: '/cfg' }
  const sent: Sent[] = []
  const host: Host = {
    env: async name => all[name], readFile: async path => (path === '/cfg/jev/backends.json' ? config : undefined),
    secret: async () => undefined, home: async () => '/home/x', now: () => 0, sleep: async () => {},
    post: async (url, body, headers, timeoutMs) => {
      sent.push({ url, headers, timeoutMs })
      const next = typeof replies === 'function' ? replies(JSON.parse(body)) : replies.shift()!
      if (next.raise) throw new Error('ECONNREFUSED')
      return { status: next.status ?? 200, text: next.text ?? '', headers: next.headers ?? {} }
    },
  }
  return { host, sent }
}

const LOCAL = { url: 'http://localhost:11435/v1/systemone', model: 'laya-0.4' }
const answers = (a: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ text: JSON.stringify({ answers: a, model: 'laya-0.4', ...extra }) })

const pick = { pick: choice('Which fits', { a: 'first', b: 'second', c: 'third' }) }
const probs = { a: 0.6, b: 0.3, c: 0.1 }
const entropy = 1 + Object.values(probs).reduce((s, p) => s + p * Math.log(p), 0) / Math.log(3) // Laya's own number
const kev = (0.6 - 1 / 3) / (1 - 1 / 3)

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9

async function code(promise: Promise<unknown>): Promise<string> {
  try { await promise; return 'answered' } catch (error) { return (error as JevError).code }
}

test("Jev's confidence is (n·p_max − 1)/(n − 1): 0 for a flat spread, 1 for a certain one", () => {
  expect(near(jevConfidence(1 / 3, 3), 0)).toBe(true)
  expect(jevConfidence(1, 5)).toBe(1)
  expect(near(jevConfidence(0.6, 3), 0.4)).toBe(true)
  expect(near(jevConfidence(0.95, 2), 0.9)).toBe(true)
})

test("a named backend's confidence is computed in Jev's units, and its own number kept beside it", async () => {
  resetSeen()
  for (const theirs of [entropy, kev]) {
    const { host } = fake(LOCAL, [answers({ pick: { type: 'choice', choice: 'a', probabilities: probs, confidence: theirs } })])
    const got = (await ask(host, 'some state', pick)).answers.pick as any
    expect(near(got.confidence, 0.4)).toBe(true)
    expect(near(got.server_confidence, theirs)).toBe(true)
  }
  // Laya 0.4.2+ sends Jev's number itself
  const { host } = fake(LOCAL, [answers({ pick: { type: 'choice', choice: 'a', probabilities: probs, confidence: entropy, x_jev_confidence: 0.42 } })])
  expect((await ask(host, 'some state', pick)).answers.pick).toMatchObject({ confidence: 0.42 })
  // a server that sends no confidence at all is still read
  const bare = fake(LOCAL, [answers({ pick: { type: 'choice', choice: 'a', probabilities: probs } })])
  expect(near(((await ask(bare.host, 'some state', pick)).answers.pick as { confidence: number }).confidence, 0.4)).toBe(true)
})

test('a score is put in the same units from its spread; with no spread its own number stays', () => {
  const q = score('How bad', ['none', 'some', 'much'])
  const spread = checkAnswer('s', q, { type: 'score', score: 0.4, probabilities: { 0: 0.7, 1: 0.2, 2: 0.1 }, confidence: 0.33 }, 'jev')
  expect(spread).toMatchObject({ server_confidence: 0.33 })
  expect(near((spread as { confidence: number }).confidence, 0.55)).toBe(true)
  expect(checkAnswer('s', q, { type: 'score', score: 1, confidence: 0.6 }, 'jev')).toMatchObject({ confidence: 0.6 })
  // Jev's own replies are read as Jev sent them
  expect(checkAnswer('s', q, { type: 'score', score: 0.4, probabilities: { 0: 0.7, 1: 0.2, 2: 0.1 }, confidence: 0.33 }))
    .toMatchObject({ confidence: 0.33 })
  expect(checkAnswer('c', pick.pick, { type: 'choice', choice: 'a', probabilities: probs, confidence: 0.8 })).toEqual({
    type: 'choice', choice: 'a', probabilities: probs, confidence: 0.8,
  })
})

test("a provider's answers keep Jev's own confidence", async () => {
  resetSeen()
  const sent: string[] = []
  const host: Host = {
    env: async name => ({ TYPESAFE_API_KEY: 'fake-typesafe-0001', XDG_CONFIG_HOME: '/cfg' } as Record<string, string>)[name],
    readFile: async () => undefined, secret: async () => undefined, home: async () => '/home/x', now: () => 0, sleep: async () => {},
    post: async url => { sent.push(url); return { status: 200, headers: {}, ...answers({ pick: { type: 'choice', choice: 'a', probabilities: probs, confidence: 0.77 } }) } as any },
  }
  expect((await ask(host, 'x', pick)).answers.pick).toEqual({ type: 'choice', choice: 'a', probabilities: probs, confidence: 0.77 })
  expect(sent).toEqual(['https://api.typesafe.ai/v1/systemone'])
})

test("a backend with no key sends no Authorization header, and answers", async () => {
  resetSeen()
  const { host, sent } = fake(LOCAL, [answers({ ok: { type: 'noul', noul: 0.9 } })])
  const reply = await ask(host, 'x', { ok: noul('It worked') })
  expect(reply.provider).toBe('mine')
  expect(sent[0]!.headers.Authorization).toBe(undefined)
  expect(sent[0]!.url).toBe('http://localhost:11435/v1/systemone')
  expect([isLocal('http://localhost:11435/v1/systemone'), isLocal('http://127.0.0.1:8000/v1/systemone'),
    isLocal('http://[::1]:8000/v1/systemone'), isLocal('https://lais05.example/v1/systemone')]).toEqual([true, true, true, false])
  // its own key, when it has one, is still sent
  const keyed = fake(LOCAL, [answers({ ok: { type: 'noul', noul: 0.9 } })], { JEV_BACKEND_MINE_API_KEY: 'mine-env-0001' })
  await ask(keyed.host, 'x', { ok: noul('It worked') })
  expect(keyed.sent[0]!.headers.Authorization).toBe('Bearer mine-env-0001')
})

test('yes/no answers that never fall between 0.2 and 0.8 are flagged once there are enough of them', async () => {
  resetSeen()
  // Von by default: a clamped P(yes)
  let n = 0
  const von = fake(LOCAL, () => answers({ ok: { type: 'noul', noul: n++ % 2 ? 0.85 : 0.15 } }))
  for (let i = 0; i < 19; i++) await ask(von.host, 'x', { ok: noul('It worked') })
  expect(pinnedWarning('mine')).toBe(null)
  await ask(von.host, 'x', { ok: noul('It worked') })
  expect(pinnedWarning('mine')).toContain('--noul-decision raw')
  expect(warnings()).toHaveLength(1)
  // one answer in between clears it, while it stays in the window
  const raw = fake(LOCAL, [answers({ ok: { type: 'noul', noul: 0.5 } })])
  await ask(raw.host, 'x', { ok: noul('It worked') })
  expect(pinnedWarning('mine')).toBe(null)
  expect(seenBackend('mine')!.nouls.length).toBe(21)
  // a confident model whose every answer is no is not a clamp
  resetSeen()
  const sure = fake(LOCAL, () => answers({ ok: { type: 'noul', noul: 0.02 } }))
  for (let i = 0; i < 30; i++) await ask(sure.host, 'x', { ok: noul('It worked') })
  expect(pinnedWarning('mine')).toBe(null)
  expect(seenBackend('mine')!.nouls.length).toBe(30)
})

test('a cut state is not judged: truncated, truncation, or X-Von-Truncated', async () => {
  resetSeen()
  const ok = { ok: { type: 'noul', noul: 0.9 } }
  for (const reply of [answers(ok, { truncated: true }), answers(ok, { truncation: { input_tokens: 900, kept: 512 } }),
    answers(ok, { truncation: 'tail' }), { ...answers(ok), headers: { 'X-Von-Truncated': '1' } }]) {
    const { host } = fake(LOCAL, [reply])
    expect(await code(ask(host, 'x', { ok: noul('It worked') }))).toBe('truncated')
  }
  for (const reply of [answers(ok, { truncated: false }), answers(ok, { truncation: null }), { ...answers(ok), headers: { 'x-von-truncated': 'false' } }]) {
    const { host } = fake(LOCAL, [reply])
    expect(await code(ask(host, 'x', { ok: noul('It worked') }))).toBe('answered')
  }
})

test('a 422 for length is not judged and not retried; another 422 stays an http error', async () => {
  resetSeen()
  const long = fake(LOCAL, [{ status: 422, text: '{"detail":"input is too long: 900 tokens, max 512"}' }, answers({})])
  expect(await code(ask(long.host, 'x', { ok: noul('It worked') }, { retries: 2 }))).toBe('input_too_long')
  expect(long.sent).toHaveLength(1)
  const other = fake(LOCAL, [{ status: 422, text: '{"detail":"unknown question type"}' }])
  expect(await code(ask(other.host, 'x', { ok: noul('It worked') }))).toBe('http_422')
})

test("a state over the backend's max_input_chars is not sent", async () => {
  resetSeen()
  const { host, sent } = fake({ ...LOCAL, max_input_chars: 200 }, [answers({ ok: { type: 'noul', noul: 0.9 } })])
  expect(await code(ask(host, 'y'.repeat(201), { ok: noul('It worked') }))).toBe('over_input_limit')
  expect(sent).toHaveLength(0)
  expect(await code(ask(host, 'y'.repeat(200), { ok: noul('It worked') }))).toBe('answered')
  expect(() => parse('mine', { ...LOCAL, max_input_chars: 10 })).toThrow('max_input_chars must be a whole number from 200 to 1000000')
  expect(() => parse('mine', { ...LOCAL, first_timeout_ms: 'slow' })).toThrow('first_timeout_ms')
  expect(parse('mine', { ...LOCAL, max_input_chars: 1800, first_timeout_ms: 60000 })).toMatchObject({ maxInputChars: 1800, firstTimeoutMs: 60000 })
  expect('maxInputChars' in parse('mine', LOCAL)).toBe(false)
})

test('a backend still loading pauses for seconds: a 503 or refused connection before it first answers, or a 503 with Retry-After', async () => {
  resetSeen()
  const q = { ok: noul('It worked') }
  const yes = answers({ ok: { type: 'noul', noul: 0.9 } })
  const refused = fake(LOCAL, [{ raise: true }, { raise: true }])
  expect(await code(ask(refused.host, 'x', q))).toBe('loading')
  expect(loadingPauseMs()).toBe(10_000)
  resetSeen()
  const busy = fake(LOCAL, [{ status: 503 }, { status: 503 }, yes, { status: 503, headers: { 'Retry-After': '7' } }, { status: 503 },
    { status: 503, headers: { 'Retry-After': '120' } }])
  expect(await code(ask(busy.host, 'x', q))).toBe('loading')
  expect(await code(ask(busy.host, 'x', q))).toBe('answered')
  // after it has answered, only a 503 that says when to come back is a pause, within 30 s
  expect(await code(ask(busy.host, 'x', q, { retries: 0 }))).toBe('loading')
  expect(loadingPauseMs()).toBe(7000)
  expect(await code(ask(busy.host, 'x', q, { retries: 0 }))).toBe('http_503')
  expect(await code(ask(busy.host, 'x', q, { retries: 0 }))).toBe('loading')
  expect(loadingPauseMs()).toBe(30_000)
  // a backend that never answers is an outage after its first three calls
  resetSeen()
  const down = fake(LOCAL, () => ({ raise: true }))
  for (let i = 0; i < 3; i++) expect(await code(ask(down.host, 'x', q, { retries: 0 }))).toBe('loading')
  expect(await code(ask(down.host, 'x', q, { retries: 0 }))).toBe('network')
})

test("a provider's 503 stays an outage", async () => {
  resetSeen()
  const host: Host = {
    env: async name => ({ TYPESAFE_API_KEY: 'fake-typesafe-0001', XDG_CONFIG_HOME: '/cfg' } as Record<string, string>)[name],
    readFile: async () => undefined, secret: async () => undefined, home: async () => '/home/x', now: () => 0, sleep: async () => {},
    post: async () => ({ status: 503, text: '', headers: { 'Retry-After': '3' } }),
  }
  expect(await code(ask(host, 'x', { ok: noul('It worked') }))).toBe('http_503')
})

test('first_timeout_ms covers the calls until the backend first answers', async () => {
  resetSeen()
  const yes = answers({ ok: { type: 'noul', noul: 0.9 } })
  const { host, sent } = fake({ ...LOCAL, first_timeout_ms: 60_000 }, [{ status: 503 }, { status: 503 }, yes, yes])
  await code(ask(host, 'x', { ok: noul('It worked') }, { timeoutMs: 2000 }))
  await ask(host, 'x', { ok: noul('It worked') }, { timeoutMs: 2000 })
  await ask(host, 'x', { ok: noul('It worked') }, { timeoutMs: 2000 })
  expect(sent.map(s => s.timeoutMs)).toEqual([60_000, 60_000, 60_000, 2000])
})
