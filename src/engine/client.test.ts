import { test, expect } from 'claude-code/testing'
import asked from '../../test/parity/fixtures/client_ask'
import checks from '../../test/parity/fixtures/client'
import urls from '../../test/parity/fixtures/urls'
import { URL_DIVERGENCES } from '../../test/parity/divergences'
import { checkUrl } from './backends'
import { ask, checkAnswer, checkQuestion, customEndpoint, JevError, retryAfterMs, type Host, type Question } from './client'

// jev-skills' client.py, captured (docs/PORTING.md): for each way a request can be routed, the
// exact URL, body and headers it sent and what came back, plus every question and answer
// check and the URL rules. Every key in the fixtures is a made-up placeholder.

type Sent = { url: string; body: string; headers: Record<string, string>; reply?: string; raised?: string }
type Case = {
  name: string; env: Record<string, string>; config: unknown; files: Record<string, string>; state: string
  questions: string | null; kwargs: Record<string, unknown>; sent: Sent[]
  result?: Record<string, unknown>; error?: string; invariant?: string | null; value_error?: string
}

/** JSON with every object's keys sorted: the fixtures were saved that way. */
const canonical = (value: unknown): string => JSON.stringify(value, (_, v) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v)

/** A mismatch as a report can print it: long strings cut, so a failure never drowns the runner. */
const brief = (value: unknown): unknown => JSON.parse(JSON.stringify(value ?? null, (_, v) =>
  typeof v === 'string' && v.length > 300 ? `${v.slice(0, 300)}… (${v.length} chars)` : v))

const STATUS_OF: Record<string, number> = { rate_limited: 429, http_503: 503, auth_failed: 401, overloaded: 529 }

/** A host with the case's environment, files and recorded replies, and no secret store. */
function hostFor(c: Case): Host {
  const env: Record<string, string> = { ...c.env, XDG_CONFIG_HOME: '/cfg' }
  const files: Record<string, string> = {}
  if (c.config !== null) files['/cfg/jev/backends.json'] = typeof c.config === 'string' ? c.config : JSON.stringify(c.config)
  for (const [name, text] of Object.entries(c.files)) files[`/cfg/jev/${name}`] = text
  const replies = [...c.sent]
  return {
    env: async name => env[name],
    readFile: async path => files[path],
    secret: async () => undefined,
    home: async () => '/home/x',
    now: () => 0,
    sleep: async () => {},
    post: async () => {
      const next = replies.shift()!
      if (next.raised === 'network') throw new Error('network')
      if (next.raised) return { status: STATUS_OF[next.raised]!, text: '', headers: {} }
      return { status: 200, text: next.reply!, headers: {} }
    },
  }
}

test('ask routes, builds and reads every request as client.py did', async () => {
  const wrong: unknown[] = []
  for (const c of asked as unknown as Case[]) {
    const sent: Sent[] = []
    const host = hostFor(c)
    const post = host.post
    host.post = async (url, body, headers, ms) => { sent.push({ url, body, headers }); return post(url, body, headers, ms) }
    const python = c.sent[0]?.headers?.['User-Agent']
    const identity = { userAgent: python ?? 'x', referer: 'https://github.com/kerpopule/hermes-jev-skills', title: 'Hermes Jev Skills' }
    const k = c.kwargs
    let got: Record<string, unknown>
    try {
      const out = await ask(host, JSON.parse(c.state), c.questions === null ? { ok: { type: 'noul', instructions: 'The text reports a success' } } : JSON.parse(c.questions), {
        identity, model: k.model as string, apiKey: k.api_key as string, provider: k.provider as any, retries: k.retries as number,
      })
      const { latency_ms: _, ...result } = out
      got = { result }
    } catch (error) {
      got = error instanceof JevError ? { error: error.code, invariant: error.invariant } : { value_error: (error as Error).message }
    }
    const { latency_ms: _l, ...wantResult } = (c.result ?? {}) as Record<string, unknown>
    const want = c.result ? { result: wantResult } : c.error ? { error: c.error, invariant: c.invariant ?? null } : { value_error: c.value_error }
    const strip = (s: Sent[]) => s.map(({ url, body, headers }) => ({ url, body, headers }))
    if (canonical(got) !== canonical(want)) wrong.push(brief({ name: c.name, what: 'outcome', got, want }))
    if (canonical(sent) !== canonical(strip(c.sent))) wrong.push(brief({ name: c.name, what: 'sent', got: sent, want: strip(c.sent) }))
  }
  expect(wrong).toEqual([])
})

type Checked = { question: unknown; answer?: unknown; result?: unknown; error?: string; invariant?: string | null }
test('answers are checked as client._check_answer checked them', () => {
  const wrong = (checks as unknown as { answers: Checked[] }).answers.flatMap((c, i) => {
    let got: unknown
    try { got = { result: checkAnswer('q', c.question as Question, c.answer) } } catch (error) {
      got = { error: (error as JevError).code, invariant: (error as JevError).invariant }
    }
    const want = 'result' in c ? { result: c.result } : { error: c.error, invariant: c.invariant ?? null }
    return canonical(got) === canonical(want) ? [] : [{ i, answer: c.answer, got, want }]
  })
  expect(wrong).toEqual([])
})

test('questions are checked as client.check_question checked them, word for word', () => {
  const wrong = (checks as unknown as { questions: Checked[] & { result?: unknown }[] }).questions.flatMap((c: any, i: number) => {
    let got: unknown
    try { got = { result: checkQuestion('q', c.question) } } catch (error) { got = { error: (error as Error).message } }
    const want = 'result' in c ? { result: c.result } : { error: c.error }
    return canonical(got) === canonical(want) ? [] : [{ i, got, want }]
  })
  expect(wrong).toEqual([])
})

type URLRow = { url: string; check_url?: string; check_url_error?: string; custom_endpoint?: string; custom_endpoint_error?: string }
test('URLs are accepted and refused as backends.py and client.py did, but for the listed divergences', () => {
  const wrong = (urls as URLRow[]).flatMap(row => {
    const fixed = URL_DIVERGENCES[row.url] ?? {}
    let a: unknown
    try { a = { check_url: checkUrl(row.url) } } catch (error) { a = { check_url_error: (error as Error).message } }
    let b: unknown
    try { b = { custom_endpoint: customEndpoint(row.url) } } catch (error) { b = { custom_endpoint_error: (error as JevError).code } }
    const wantA = 'check_url' in fixed ? fixed.check_url : 'check_url' in row ? { check_url: row.check_url } : { check_url_error: row.check_url_error }
    const wantB = 'custom_endpoint' in fixed ? fixed.custom_endpoint : 'custom_endpoint' in row ? { custom_endpoint: row.custom_endpoint } : { custom_endpoint_error: row.custom_endpoint_error }
    const bad = []
    if (JSON.stringify(a) !== JSON.stringify(wantA)) bad.push({ url: row.url, what: 'check_url', got: a, want: wantA })
    if (JSON.stringify(b) !== JSON.stringify(wantB)) bad.push({ url: row.url, what: 'custom_endpoint', got: b, want: wantB })
    return bad
  })
  expect(wrong).toEqual([])
})

test('retry-after is read in ms, numeric only, capped at a minute', () => {
  expect(retryAfterMs({ 'Retry-After': '2' })).toBe(2000)
  expect(retryAfterMs({ 'retry-after-ms': '150', 'retry-after': '9' })).toBe(150)
  expect(retryAfterMs({ 'retry-after': '600' })).toBe(60_000)
  expect(retryAfterMs({ 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' })).toBe(null)
  expect(retryAfterMs({})).toBe(null)
})

test("the mod's backend key reaches only the default backend's URL, never one JEV_BACKEND picks", async () => {
  const config = JSON.stringify({ default: 'alpha', backends: {
    alpha: { url: 'https://alpha.example/v1/systemone', model: 'a' },
    beta: { url: 'https://beta.example/v1/systemone', model: 'b' },
  } })
  const reply = JSON.stringify({ answers: { ok: true } })
  const run = async (env: Record<string, string>) => {
    const sent: { url: string; headers: Record<string, string> }[] = []
    const all: Record<string, string> = { ...env, XDG_CONFIG_HOME: '/cfg' }
    const host: Host = {
      env: async name => all[name], readFile: async path => (path === '/cfg/jev/backends.json' ? config : undefined),
      secret: async () => undefined, home: async () => '/home/x', now: () => 0, sleep: async () => {},
      setting: async name => (name === 'backend_api_key' ? 'alpha-settings-0001' : undefined),
      post: async (url, _body, headers) => { sent.push({ url, headers }); return { status: 200, text: reply, headers: {} } },
    }
    try { await ask(host, {}, { ok: { type: 'noul', instructions: 'The text reports a success' } }) } catch { /* only what was sent matters */ }
    return sent
  }
  const beta = await run({ JEV_BACKEND: 'beta' })
  expect(beta.map(s => s.url)).toEqual(['https://beta.example/v1/systemone'])
  expect(beta.map(s => s.headers.Authorization)).toEqual([undefined])
  const alpha = await run({})
  expect(alpha.map(s => s.url)).toEqual(['https://alpha.example/v1/systemone'])
  expect(alpha.map(s => s.headers.Authorization)).toEqual(['Bearer alpha-settings-0001'])
})
