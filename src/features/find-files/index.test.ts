import { test, expect } from 'claude-code/testing'
import type { FetchInit, IO } from '../../core/io'
import { apply } from '../dashboard'
import { run } from '../command'
import { find } from './index'

// find-files' glue with a fake IO: a small project, git's listing and counts, and a fake
// decision backend that judges each card by what it names. No real key, no real config.

const USER = '/home/u/.config/jev-mod/config.json'
const ROOT = '/proj'

const TREE: Record<string, string> = {
  'src/net/retry.ts': '// Retries a request with exponential backoff.\nexport async function withBackoff() {}\n',
  'src/net/client.ts': "// The HTTP client.\nimport { withBackoff } from './retry'\nexport function get() {}\n",
  'src/ui/button.tsx': '// A button.\nexport function Button() {}\n',
  'src/config/load.ts': '// Reads the config file.\nexport function loadConfig() {}\n',
  'src/keys.ts': `// The retry service key.\nexport const retryToken = "ghp_${'Ab3d'.repeat(9)}"\n`,
  'docs/retry.md': '# Retry and backoff\nHow retries work.\n',
  'logo.png': 'binary',
}

type Fake = IO & { disk: Record<string, string>; store: Record<string, unknown>; asked: { state: any; questions: Record<string, unknown> }[]; ran: string[][] }

type Opts = { settings?: Record<string, unknown>; backend?: 'judge' | 'down' | 'none'; git?: boolean; judgeOnly?: number; options?: Record<string, unknown> }

function io(opts: Opts = {}): Fake {
  const files: Record<string, string> = { [USER]: JSON.stringify({ features: { 'find-files': opts.settings ?? { mode: 'on' } } }) }
  for (const [path, text] of Object.entries(TREE)) files[`${ROOT}/${path}`] = text
  const store: Record<string, unknown> = {}
  const asked: Fake['asked'] = []
  const ran: string[][] = []
  const backend = opts.backend ?? 'judge'
  const env: Record<string, string> = { JEV_HOME: '/jev', JEV_LIMITS: 'off', ...(backend !== 'none' ? { TYPESAFE_API_KEY: 'test-not-a-key' } : {}) }
  return {
    disk: files, store, asked, ran,
    option: (name: string) => opts.options?.[name] as string | boolean | undefined,
    readFile: async (path: string) => { if (path in files) return files[path]; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    folders: async (dir: string) => {
      const prefix = `${dir}/`
      return [...new Set(Object.keys(files).filter(p => p.startsWith(prefix) && p.slice(prefix.length).includes('/'))
        .map(p => p.slice(prefix.length).split('/')[0]!))]
    },
    files: async (dir: string) => Object.keys(files).filter(p => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
      .map(p => ({ name: p.slice(dir.length + 1), mtimeMs: 0 })),
    env: async (name: string) => env[name],
    home: async () => '/home/u',
    projectRoot: async () => ROOT,
    run: async (argv: string[]) => {
      ran.push(argv)
      if (opts.git === false || argv[0] !== 'git') return { exitCode: 128, stdout: '', stderr: 'not a git repository' }
      if (argv[3] === 'ls-files') return { exitCode: 0, stdout: Object.keys(TREE).join('\0') + '\0', stderr: '' }
      if (argv[3] === 'grep') {
        const terms = argv.filter((_, i) => argv[i - 1] === '-e')
        const lines = Object.entries(TREE).map(([p, t]) => [p, t.split('\n').filter(l => terms.some(term => l.toLowerCase().includes(term))).length] as const)
          .filter(([, n]) => n > 0).map(([p, n]) => `${p}:${n}`)
        return { exitCode: lines.length ? 0 : 1, stdout: lines.join('\n'), stderr: '' }
      }
      return { exitCode: 1, stdout: '', stderr: '' }
    },
    sleep: () => new Promise<void>(() => {}),
    sessionId: async () => 's1',
    storeGet: async (key: string) => store[key],
    storeSet: async (key: string, value: unknown) => { store[key] = value },
    status: () => {}, toast: () => {},
    fetch: async (_url: string, init?: FetchInit) => {
      if (backend !== 'judge' || (opts.judgeOnly !== undefined && asked.length >= opts.judgeOnly)) { asked.push({ state: null, questions: {} }); return { status: opts.judgeOnly !== undefined ? 400 : 503, ok: false, text: '' } }
      const body = JSON.parse(init!.body!)
      asked.push(body)
      // implements: the retry module; related: anything else naming retries; the rest unrelated
      const answers = Object.fromEntries(Object.keys(body.questions).map(q => {
        const card: string = body.state.files[`F${q.slice(1)}`]
        const choice = card.includes('src/net/retry.ts') ? 'implements' : /retr/i.test(card) ? 'related' : 'unrelated'
        const probabilities = { implements: 0.05, related: 0.05, unrelated: 0.05, [choice]: 0.9 }
        return [q, { type: 'choice', choice, probabilities, confidence: 0.9 }]
      }))
      return { status: 200, ok: true, text: JSON.stringify({ answers, model: 'jev-test', usage: { input_tokens: 1000 } }) }
    },
  } as unknown as Fake
}

const today = (fake: Fake) => Object.values(fake.store.activity as Record<string, any>)[0]['find-files']
const settle = () => new Promise(r => setTimeout(r, 10))

test('with the decision model: the implementing file first, unrelated files left out, binaries never read', async () => {
  const fake = io()
  const out = await find(fake, { query: 'where are retries with exponential backoff done' })
  const lines = out.split('\n')
  expect(lines[0]).toMatch(/^\d+ files? for "where are retries with exponential backoff done" in \/proj, ranked by the decision model; 6 files searched\.$/)
  expect(lines[1]).toBe('1. src/net/retry.ts [implements 0.90] Retries a request with exponential backoff.')
  expect(out).toContain('src/net/client.ts [related 0.90]')
  expect(out).not.toContain('button.tsx')
  expect(out).not.toContain('logo.png')
  // one request, the query and cards inside it; the card that holds a token was never sent
  expect(fake.asked.length).toBe(1)
  expect(fake.asked[0]!.state.query).toBe('where are retries with exponential backoff done')
  expect(JSON.stringify(fake.asked[0]!.state)).not.toContain('src/keys.ts')
  expect(JSON.stringify(fake.asked[0]!.state)).not.toContain('Ab3d')
  await settle()
  expect(today(fake).ranked).toBe(1)
  expect(today(fake).asked).toBe(1)
  expect(today(fake).cost).toBeGreaterThan(0)
})

test('the limit cuts the list, and the model\'s limit wins over the knob', async () => {
  const out = await find(io({ settings: { mode: 'on', limit: 5 } }), { query: 'retry backoff', limit: 1 })
  expect(out.split('\n').length).toBe(2)
})

// A refused batch (400), not an outage: an outage would start the cool-off for the tests after it.
test('when some batches fail, the header says how many were judged', async () => {
  const fake = io({ git: false, judgeOnly: 1 })
  for (let i = 0; i < 50; i++) fake.disk[`${ROOT}/src/extra/retry${i}.ts`] = '// Retry helper.\nexport const retry = 1\n'
  const out = await find(fake, { query: 'retry backoff' })
  expect(out.split('\n')[0]).toContain('ranked by the decision model (1 of 2 batches judged)')
})

test('no key: the local ranking, labelled, and nothing fails', async () => {
  const fake = io({ backend: 'none' })
  const out = await find(fake, { query: 'retries with exponential backoff' })
  expect(out.split('\n')[0]).toContain('local ranking only (no decision backend key)')
  expect(out.split('\n')[1]).toMatch(/^1\. src\/net\/retry\.ts \[score [\d.]+\]/)
  await settle()
  expect(today(fake)['local-only']).toBe(1)
})

test('private mode, or a query that holds a secret: local, labelled, nothing sent', async () => {
  const privately = io({ options: { private: true } })
  const priv = await find(privately, { query: 'retry backoff' })
  expect(priv.split('\n')[0]).toContain('local ranking only (private mode)')
  expect(privately.asked.length).toBe(0)

  const secret = io()
  const out = await find(secret, { query: `retry with token ghp_${'Ab3d'.repeat(9)}` })
  expect(out.split('\n')[0]).toContain('local ranking only (the query looks like it holds a secret)')
  expect(secret.asked.length).toBe(0)
})

test('no git: a walk finds the same files, skipping node_modules', async () => {
  const fake = io({ git: false, backend: 'none' })
  fake.disk[`${ROOT}/node_modules/retry/index.js`] = '// retry backoff\nmodule.exports = {}\n'
  const out = await find(fake, { query: 'retries with exponential backoff' })
  expect(out).toContain('src/net/retry.ts')
  expect(out).not.toContain('node_modules')
  expect(out.split('\n')[0]).toContain('6 files searched')
})

test('off, no query, a folder outside the project: a plain answer, never a throw', async () => {
  expect(await find(io({ settings: { mode: 'off' } }), { query: 'retry' })).toContain('find_files is off')
  expect(await find(io(), {})).toContain('needs a query')
  expect(await find(io(), { query: 'retry', path: '../elsewhere' })).toContain('inside the project')
  expect(await find(io(), { query: 'the code' })).toContain('no words to search for')
  const inSub = await find(io({ backend: 'none' }), { query: 'retry', path: 'src/ui' })
  expect(inSub).toContain('in /proj/src/ui')
})

test('the registry entry is all /jev-mod and the dashboard need: listed, helped, set, and read back', async () => {
  const fake = io({ backend: 'none' })
  delete fake.disk[USER]
  expect((await run(fake, 'list')).text).toContain('find-files')
  expect((await run(fake, 'find-files')).text).toContain('There is no shadow')
  expect((await run(fake, 'find-files shadow')).text).toContain('mode must be off, on')
  expect((await run(fake, 'find-files maxCandidates 30')).text).toContain('30')
  expect(JSON.parse(fake.disk[USER]!).features['find-files'].maxCandidates).toBe(30)
  expect(await apply(fake, { id: 'op-1', op: 'set', scope: 'user', feature: 'find-files', key: 'mode', value: 'off' })).toEqual({ ok: true, message: `written to ${USER}` })
  expect(await find(fake, { query: 'retry' })).toContain('find_files is off')
})

// Last: a failure starts the five-minute cool-off for the rest of this file's process.
test('a backend that fails: local, labelled; then the cool-off asks nothing', async () => {
  const down = await find(io({ backend: 'down' }), { query: 'retry backoff' })
  expect(down.split('\n')[0]).toContain('local ranking only (the decision backend failed: http_503)')
  const after = io()
  expect((await find(after, { query: 'retry backoff' })).split('\n')[0]).toContain('cooling off')
  expect(after.asked.length).toBe(0)
})
