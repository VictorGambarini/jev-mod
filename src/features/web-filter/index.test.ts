import { test, expect } from 'claude-code/testing'
import type { FetchInit, IO } from '../../core/io'
import { settled } from '../../core/background'
import { filter, noteGoal } from './index'

const USER = '/home/u/.config/jev-mod/config.json'

type Fake = IO & { files: Record<string, string>; store: Record<string, unknown>; asked: { state: any; questions: Record<string, unknown> }[] }

/** A fake IO; `helps` answers each result or part the decision model is asked about (none: the backend is down). */
function io(settings: Record<string, unknown>, helps?: (text: string) => number, env: Record<string, string> = {}): Fake {
  const files: Record<string, string> = { [USER]: JSON.stringify({ features: { 'web-filter': settings } }) }
  const store: Record<string, unknown> = {}
  const asked: Fake['asked'] = []
  const vars: Record<string, string> = { JEV_HOME: '/jev', JEV_LIMITS: 'off', TYPESAFE_API_KEY: 'test-not-a-key', ...env }
  return {
    files, store, asked,
    option: () => undefined,
    readFile: async (path: string) => { if (path in files) return files[path]; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    folders: async () => [],
    env: async (name: string) => vars[name],
    home: async () => '/home/u',
    projectRoot: async () => undefined,
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
    sleep: () => new Promise<void>(() => {}),
    sessionId: async () => 's1',
    storeGet: async (key: string) => store[key],
    storeSet: async (key: string, value: unknown) => { store[key] = value },
    status: () => {}, toast: () => {},
    fetch: async (_url: string, init?: FetchInit) => {
      const body = JSON.parse(init!.body!)
      asked.push(body)
      if (!helps) return { status: 503, ok: false, text: '' }
      const items = { ...(body.state.results ?? {}), ...(body.state.parts ?? {}) }
      const answers = Object.fromEntries(Object.keys(body.questions).map(q => [q, { type: 'noul', noul: helps(items[q.toUpperCase()]) }]))
      return { status: 200, ok: true, text: JSON.stringify({ answers, model: 'jev-test', usage: { input_tokens: 1000 } }) }
    },
  } as unknown as Fake
}

const today = (fake: Fake) => Object.values(fake.store.activity as Record<string, any>)[0]['web-filter']

// A search for bun's test runner: two good results, junk, and repeats.
const search = () => ({
  query: 'bun test mock fetch',
  results: [
    'Here are the results.',
    { tool_use_id: 'srvtoolu_1', content: [
      { title: 'Bun test docs', url: 'https://bun.sh/docs/test' },
      { title: 'Mocking in Bun', url: 'https://bun.sh/docs/test/mocks' },
      { title: 'Bun test docs', url: 'https://bun.sh/docs/test' },
      { title: 'Mock fetch with bun:test', url: 'https://blog.dev/bun-mock-fetch' },
      { title: 'CASINO BONUS FREE SPINS', url: 'https://spam.example/casino' },
      { title: 'Mocking in Bun', url: 'https://bun.sh/docs/test/mocks' },
      { title: 'Best bread buns recipe', url: 'https://recipes.example/buns' },
    ] },
  ],
  durationSeconds: 2,
})
const junk = (text: string) => (/CASINO|bread/.test(text) ? 0.05 : 0.9)
const call = { tool: 'WebSearch', query: 'bun test mock fetch', subagent: false }

test('on: junk the decision model is sure of and exact duplicates go; one line says how many', async () => {
  noteGoal('how do I mock fetch in bun tests?')
  const fake = io({ mode: 'on' }, junk)
  const out = await filter(fake, call, search()) as ReturnType<typeof search>
  const urls = (out.results[1] as any).content.map((c: any) => c.url)
  expect(urls).toEqual(['https://bun.sh/docs/test', 'https://bun.sh/docs/test/mocks', 'https://blog.dev/bun-mock-fetch'])
  expect(out.results[0]).toBe('Here are the results.')
  expect(out.results.at(-1)).toBe('[jev-mod web filter: dropped 4 of 7 results (2 duplicate, 2 judged unhelpful)]')
  // one request, and the top 3 distinct results were never asked about
  expect(fake.asked.length).toBe(1)
  expect(Object.keys(fake.asked[0]!.questions).sort()).toEqual(['r4', 'r6'])
  expect(fake.asked[0]!.state.request).toBe('how do I mock fetch in bun tests?')
  await settled()
  expect(today(fake)['results-dropped']).toBe(4)
  expect(today(fake)['chars-saved']).toBeGreaterThan(100)
})

test('the top 3 stay, in order, even when the decision model would drop them all', async () => {
  noteGoal('anything')
  const fake = io({ mode: 'on' }, () => 0)
  const results = [{ tool_use_id: 't', content: ['a', 'b', 'c', 'd', 'e'].map(x => ({ title: x, url: `https://${x}.dev` })) }]
  const out = await filter(fake, call, { query: 'q', results }) as any
  expect(out.results[0].content.map((c: any) => c.title)).toEqual(['a', 'b', 'c'])
  // keepTop is a knob
  const five = await filter(io({ mode: 'on', keepTop: 5 }, () => 0), call, { query: 'q', results })
  expect(five).toBe(null)
})

test('a host the person named is never dropped', async () => {
  noteGoal('what does recipes.example say about bun?')
  const out = await filter(io({ mode: 'on' }, () => 0), call, search()) as any
  const urls = out.results[1].content.map((c: any) => c.url)
  expect(urls).toContain('https://recipes.example/buns')
  expect(urls).not.toContain('https://spam.example/casino')
})

test('shadow changes nothing, waits for nothing, and counts what it would have dropped', async () => {
  noteGoal('how do I mock fetch in bun tests?')
  const fake = io({ mode: 'shadow' }, junk)
  expect(await filter(fake, call, search())).toBe(null)
  await settled()
  await new Promise(r => setTimeout(r, 10))
  expect(today(fake)['would-drop-results']).toBe(4)
  expect(today(fake)['results-dropped']).toBe(undefined)
  const band = (fake.store.sessions as any).s1.features['web-filter']
  expect(band.would).toBe(4)
})

// A long fetched page: install steps the question needs, and community chatter it does not.
const prose = (topic: string) => `${`This part of the page talks about ${topic} in general terms. `.repeat(20).trim()}\n\n`
const page = () => [
  '# Bun guide\n\nIntro to the page.\n\n',
  prose('the community forum and how friendly it is'),
  prose('our sponsors and their logos'),
  prose('installing the runtime on linux with the script'),
  prose('the history of the project mascot'),
  prose('who wrote the blog posts this year'),
  prose('installing the runtime on macos with brew'),
  prose('the merchandise store and its hoodies'),
  prose('the conference talks and their slides'),
  prose('the newsletter and how to subscribe'),
  '## Changelog\n\nVersion 1.2.3 fixed the installer.\n\n',
  prose('the discord server rules'),
].join('')
const fetchCall = { tool: 'WebFetch', url: 'https://bun.sh/guide', prompt: 'How do I install bun?', subagent: false }
const relevant = (text: string) => (/installing/.test(text) ? 0.95 : 0.03)

test('on: a long fetch keeps the parts the question needs and marks what was cut', async () => {
  noteGoal('install bun on my laptop')
  const fake = io({ mode: 'on' }, relevant)
  const text = page()
  expect(text.length).toBeGreaterThan(4000)
  const out = await filter(fake, fetchCall, { result: text, url: 'https://bun.sh/guide', code: 200 }) as { result: string }
  expect(out.result.length).toBeLessThan(text.length * 0.8)
  expect(out.result.startsWith('# Bun guide')).toBe(true) // the first part always stays
  expect(out.result).toContain('installing the runtime on linux')
  expect(out.result).toContain('installing the runtime on macos')
  expect(out.result).toContain('Version 1.2.3') // a figure: kept without asking
  expect(out.result).not.toContain('conference talks')
  expect(out.result).toMatch(/\[jev-mod web filter: cut [\d,]+ characters here, starting "This part of the page talks about/)
  expect(out.result).toMatch(/\[jev-mod web filter: cut [\d,]+ of [\d,]+ characters of this result \(\d+ parts?\) the question did not need\]$/)
  expect(fake.asked.length).toBe(1) // one request
  expect(fake.asked[0]!.state.prompt).toBe('How do I install bun?')
  await settled()
  expect(today(fake)['chunks-dropped']).toBeGreaterThan(0)
  const band = (fake.store.sessions as any).s1.features['web-filter']
  expect(band.chars).toBeGreaterThanOrEqual(text.length - out.result.length) // the session's total
})

test('a short fetch, or one from a host the person named, is left alone', async () => {
  noteGoal('install bun')
  const fake = io({ mode: 'on' }, relevant)
  expect(await filter(fake, fetchCall, { result: 'short answer' })).toBe(null)
  noteGoal('read bun.sh and tell me how to install it')
  expect(await filter(fake, fetchCall, { result: page() })).toBe(null)
  expect(fake.asked.length).toBe(0)
})

test('a subagent\'s call is judged without the person\'s request', async () => {
  noteGoal('how do I mock fetch in bun tests?')
  const fake = io({ mode: 'on' }, junk)
  await filter(fake, { ...call, subagent: true }, search())
  expect(fake.asked[0]!.state.request).toBe('(not known)')
})

test('shadow on a long fetch only counts', async () => {
  noteGoal('install bun on my laptop')
  const shadow = io({ mode: 'shadow' }, relevant)
  expect(await filter(shadow, fetchCall, { result: page() })).toBe(null)
  await settled()
  await new Promise(r => setTimeout(r, 10))
  expect(today(shadow)['would-drop-chunks']).toBeGreaterThan(0)
  expect(today(shadow)['would-save-chars']).toBeGreaterThan(1000)
})

// Last: a backend that is down starts the cool-off, and the cool-off holds for the rest of this file.
test('fails open: off, private mode, no key, a backend down — the result passes as it came', async () => {
  noteGoal('how do I mock fetch in bun tests?')
  expect(await filter(io({ mode: 'off' }, junk), call, search())).toBe(null)
  expect(await filter(io({ mode: 'on' }, junk), call, { nothing: true })).toBe(null)
  const quiet = io({ mode: 'on' }, junk)
  quiet.option = (name: string) => (name === 'private' ? true : undefined)
  expect(await filter(quiet, call, search())).toBe(null)
  expect(quiet.asked.length).toBe(0)
  const keyless = io({ mode: 'on' }, junk, { TYPESAFE_API_KEY: '' })
  expect(await filter(keyless, call, search())).toBe(null)
  await settled()
  expect(today(keyless).skipped).toBe(1)
  // down: one request, no answer, nothing changed
  const down = io({ mode: 'on' })
  expect(await filter(down, fetchCall, { result: page() })).toBe(null)
  expect(down.asked.length).toBe(1)
  // and while it cools off, nothing is sent
  const after = io({ mode: 'on' }, junk)
  expect(await filter(after, call, search())).toBe(null)
  expect(after.asked.length).toBe(0)
})
