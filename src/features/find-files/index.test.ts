import { test, expect } from 'claude-code/testing'
import type { FetchInit, IO } from '../../core/io'
import { apply } from '../dashboard'
import { run } from '../command'
import { find, SPEC } from './index'
import { isTestPath, loadIndex } from './symbol-index'

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

type Fake = IO & { disk: Record<string, string>; store: Record<string, unknown>; asked: { state: any; questions: Record<string, unknown> }[]; ran: string[][]; reads: string[]; tree: Record<string, string>; dirty: string[] }

type Opts = { settings?: Record<string, unknown>; backend?: 'judge' | 'unrelated' | 'down' | 'none'; git?: boolean; judgeOnly?: number; options?: Record<string, unknown>; tree?: Record<string, string>; env?: Record<string, string> }

// a stand-in for a git blob id: changes when the text does
const blobOf = (text: string) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7).toString(16).padStart(40, '0')

function io(opts: Opts = {}): Fake {
  const files: Record<string, string> = { [USER]: JSON.stringify({ features: { 'find-files': opts.settings ?? { mode: 'on' } } }) }
  const tree = { ...(opts.tree ?? TREE) }
  for (const [path, text] of Object.entries(tree)) files[`${ROOT}/${path}`] = text
  const store: Record<string, unknown> = {}
  const asked: Fake['asked'] = []
  const ran: string[][] = []
  const reads: string[] = []
  const dirty: string[] = []
  const backend = opts.backend ?? 'judge'
  const env: Record<string, string> = { JEV_HOME: '/jev', JEV_LIMITS: 'off', ...(backend !== 'none' ? { TYPESAFE_API_KEY: 'test-not-a-key' } : {}), ...opts.env }
  return {
    disk: files, store, asked, ran, reads, tree, dirty,
    option: (name: string) => opts.options?.[name] as string | boolean | undefined,
    readFile: async (path: string) => { reads.push(path); if (path in files) return files[path]; throw new Error('ENOENT') },
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
      if (argv[0] === 'mkdir') return { exitCode: 0, stdout: '', stderr: '' }
      if (opts.git === false || argv[0] !== 'git') return { exitCode: 128, stdout: '', stderr: 'not a git repository' }
      const now = Object.fromEntries(Object.keys(tree).map(p => [p, files[`${ROOT}/${p}`]!]))
      if (argv[3] === 'ls-files' && argv.includes('-s')) return { exitCode: 0, stdout: Object.keys(tree).map(p => `100644 ${blobOf(tree[p]!)} 0\t${p}\0`).join(''), stderr: '' }
      if (argv[3] === 'ls-files' && argv.includes('-m')) return { exitCode: 0, stdout: dirty.map(p => `${p}\0`).join(''), stderr: '' }
      if (argv[3] === 'ls-files') return { exitCode: 0, stdout: Object.keys(tree).join('\0') + '\0', stderr: '' }
      if (argv[3] === 'grep' && argv.includes('-l')) {
        const name = argv[argv.indexOf('-e') + 1]!
        const word = new RegExp(`(^|\\W)${name}(\\W|$)`)
        const held = Object.entries(now).filter(([, t]) => word.test(t)).map(([p]) => p)
        return { exitCode: held.length ? 0 : 1, stdout: held.map(p => `${p}\0`).join(''), stderr: '' }
      }
      if (argv[3] === 'grep') {
        const terms = argv.filter((_, i) => argv[i - 1] === '-e').flatMap(e => e.split('|'))
        const lines = Object.entries(now).map(([p, t]) => [p, t.split('\n').filter(l => terms.some(term => l.toLowerCase().includes(term))).length] as const)
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
      if ((backend !== 'judge' && backend !== 'unrelated') || (opts.judgeOnly !== undefined && asked.length >= opts.judgeOnly)) { asked.push({ state: null, questions: {} }); return { status: opts.judgeOnly !== undefined ? 400 : 503, ok: false, text: '' } }
      const body = JSON.parse(init!.body!)
      asked.push(body)
      // implements: the retry module; related: anything else naming retries; the rest unrelated
      const answers = Object.fromEntries(Object.keys(body.questions).map(q => {
        const card: string = body.state.files[`F${q.slice(1)}`]
        const choice = backend === 'unrelated' ? 'unrelated' : card.includes('src/net/retry.ts') || card.includes('chargeCard') ? 'implements' : /retr/i.test(card) ? 'related' : 'unrelated'
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
  const fake = io({ settings: { mode: 'on', shortcut: false } })
  const out = await find(fake, { query: 'where are retries with exponential backoff done' })
  const lines = out.split('\n')
  expect(lines[0]).toMatch(/^\d+ files? for "where are retries with exponential backoff done" in \/proj, ranked by the decision model; 6 files searched\.$/)
  expect(lines[1]).toBe('1. src/net/retry.ts [implements 0.90] Retries a request with exponential backoff.')
  // the lines to read first, under the file: its definition
  expect(lines[2]).toBe('   2: export async function withBackoff() {}')
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
  expect(out.split('\n').filter(l => /^\d+\. /.test(l)).length).toBe(1)
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
  const privately = io({ options: { private: true }, settings: { mode: 'on', shortcut: false } })
  const priv = await find(privately, { query: 'retry backoff' })
  expect(priv.split('\n')[0]).toContain('local ranking only (private mode)')
  expect(privately.asked.length).toBe(0)

  const secret = io({ settings: { mode: 'on', shortcut: false } })
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
  expect(await find(io(), {})).toContain('needs a `query`')
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

test('the shortcut: a clear local lead answers without the decision model; off, it asks', async () => {
  // retry.ts and docs/retry.md both hold both words in their names and headers, far ahead of the rest
  const fake = io()
  const out = await find(fake, { query: 'retry backoff' })
  expect(out.split('\n')[0]).toContain('ranked locally: the first 2 files lead clearly by the query\'s words, so the decision model was not asked')
  expect(out.split('\n')[1]).toMatch(/^1\. src\/net\/retry\.ts \[score [\d.]+\] Retries a request with exponential backoff\.$/)
  expect(out).toMatch(/^2\. docs\/retry\.md /m)
  expect(fake.asked.length).toBe(0)
  await settle()
  expect(today(fake).clear).toBe(1)
  // not clear enough: asked
  const close = io()
  expect((await find(close, { query: 'retries with exponential backoff' })).split('\n')[0]).toContain('ranked by the decision model')
  // the shortcut off: asked
  const asking = io({ settings: { mode: 'on', shortcut: false } })
  expect((await find(asking, { query: 'retry backoff' })).split('\n')[0]).toContain('ranked by the decision model')
  expect(asking.asked.length).toBe(1)
})

const SHOP: Record<string, string> = {
  'src/billing/charge.ts': '// Moves money from a stored card.\nexport function chargeCard(card) {\n  return gateway.capture(card)\n}\n',
  'src/billing/statement.ts': '// The monthly statement for a customer.\nexport function buildStatement() {}\n',
  'src/ui/customer-page.tsx': '// The customer page.\nexport function CustomerPage() {}\n',
}

test('the model\'s guessed names and synonyms find a file the query\'s words miss; they are never sent', async () => {
  const words = { query: 'take payment from the customer', limit: 3 }
  const without = await find(io({ tree: SHOP, backend: 'none' }), words)
  expect(without).not.toContain('src/billing/charge.ts')
  const fake = io({ tree: SHOP, settings: { mode: 'on', shortcut: false } })
  const out = await find(fake, { ...words, identifiers: ['chargeCard'], synonyms: 'capture, debit' })
  expect(out).toContain('src/billing/charge.ts')
  expect(out).toContain('   2: export function chargeCard(card) {')
  const sent = JSON.stringify(fake.asked.map(a => a.state.query))
  expect(sent).toBe('["take payment from the customer"]')
  // the guessed name was found through the symbol index, which was written to the cache
  expect(Object.keys(fake.disk).some(p => p.startsWith('/home/u/.cache/jev-mod/find-files/symbols-'))).toBe(true)
})

test('nothing implements it: every candidate judged unrelated is said plainly, with the closest by words', async () => {
  const tree = { ...TREE }
  delete tree['src/keys.ts'] // a card never sent is never judged, so it would still be listed
  const fake = io({ tree, backend: 'unrelated', settings: { mode: 'on', shortcut: false } })
  const out = await find(fake, { query: 'retries with exponential backoff' })
  expect(out).toContain('Nothing here implements it: the decision model judged all')
  expect(out).toContain('the closest by words: src/net/retry.ts')
  expect(out).not.toMatch(/^1\. /m)
})

const CODE: Record<string, string> = {
  'src/payments/refunds.ts': '// refundPayment sends the money back.\nexport async function refundPayment(id: string) {}\nexport async function refundPaymentLater(id: string) {}\n',
  'src/orders/cancel.ts': "import { refundPayment } from '../payments/refunds'\nexport async function cancel(o) {\n  const note = 'calls refundPayment'\n  await refundPayment(o.paymentId)\n}\n",
  'src/disputes/resolve.ts': "import { refundPaymentLater } from '../payments/refunds'\nexport const resolve = (d) => refundPaymentLater(d.id)\n",
  'src/payments/legacy.py': 'def refund_payment(payment_id):\n    pass\n',
  'docs/refunds.md': 'Call refundPayment(id) to refund.\n',
}

test('symbol: definitions, imports and calls in code only; comments, strings, docs and longer names left out; names alike listed apart', async () => {
  const fake = io({ tree: CODE })
  const out = await find(fake, { symbol: 'refundPayment' })
  const lines = out.split('\n')
  expect(lines[0]).toBe('refundPayment in /proj: 1 definition, 1 call, 0 other uses, 1 import; in code only (not in comments or strings, not inside longer names); 5 files searched (git grep).')
  expect(lines).toContain('defined:')
  expect(lines).toContain('  src/payments/refunds.ts:2 (function)  export async function refundPayment(id: string) {}')
  expect(lines).toContain('  src/orders/cancel.ts:4  await refundPayment(o.paymentId)')
  expect(lines).toContain("  src/orders/cancel.ts:1  import { refundPayment } from '../payments/refunds'")
  expect(out).not.toContain('src/disputes/resolve.ts:')
  expect(out).not.toContain('docs/refunds.md')
  expect(out).not.toContain(':3 ') // the string on cancel.ts:3
  expect(lines[lines.length - 1]).toBe('Other names alike, not counted above: refund_payment (function, src/payments/legacy.py:1); refundPaymentLater (function, src/payments/refunds.ts:3).')
  expect(fake.asked.length).toBe(0) // no decision model
  await settle()
  expect(today(fake).symbol).toBe(1)
})

test('symbol: calls in tests are counted and listed after the code', async () => {
  const out = await find(io({ tree: { ...CODE, 'src/payments/refunds.test.ts': "import { refundPayment } from './refunds'\nawait refundPayment('p1')\n" } }), { symbol: 'refundPayment' })
  const lines = out.split('\n')
  expect(lines[0]).toContain('1 definition, 2 calls, 0 other uses, 2 imports (2 of them in tests, listed after the code)')
  expect(lines.indexOf('  src/orders/cancel.ts:4  await refundPayment(o.paymentId)')).toBeLessThan(lines.indexOf("  src/payments/refunds.test.ts:2  await refundPayment('p1')"))
  for (const p of ['tests/a.py', 'src/__tests__/a.ts', 'a/test_b.py', 'a/b.test.ts', 'a/b_spec.rb', 'pkg/x_test.go', 'saleor/order/tests/test_x.py']) expect(isTestPath(p), p).toBe(true)
  for (const p of ['src/testing.ts', 'src/latest/a.ts', 'contest.py']) expect(isTestPath(p), p).toBe(false)
})

test('symbol: a name nowhere in the code, a bad name, and no git (the files read instead)', async () => {
  expect(await find(io({ tree: CODE }), { symbol: 'chargeCard' })).toContain('chargeCard is not in this project\'s code.')
  expect(await find(io({ tree: CODE }), { symbol: 'refund payment' })).toContain('is not one name')
  const walked = await find(io({ tree: CODE, git: false }), { symbol: 'refundPayment' })
  expect(walked.split('\n')[0]).toContain('1 definition, 1 call, 0 other uses, 1 import')
  expect(walked.split('\n')[0]).toContain('(read)')
})

test('the symbol index: kept per folder, keyed by blob; a changed or uncommitted file is read again and not kept', async () => {
  const fake = io({ tree: CODE })
  const files = Object.keys(CODE)
  const first = await loadIndex(fake, ROOT, files)
  expect(first.complete).toBe(true)
  expect(first.cached).toBe(0)
  expect(first.files).toBe(4) // the Markdown file is not code
  expect(first.defs.get('src/payments/refunds.ts')!.map(d => d.name)).toEqual(['refundPayment', 'refundPaymentLater'])
  const cacheFile = Object.keys(fake.disk).find(p => p.startsWith('/home/u/.cache/jev-mod/find-files/'))!
  expect(fake.ran.some(r => r[0] === 'mkdir' && r.includes('700'))).toBe(true)
  // again: nothing read, all from the cache
  fake.reads.length = 0
  const second = await loadIndex(fake, ROOT, files)
  expect(second.cached).toBe(4)
  expect(fake.reads.filter(p => p !== cacheFile)).toEqual([])
  // a commit changes one file: only it is read
  fake.tree['src/orders/cancel.ts'] = 'export function cancelOrder() {}\n'
  fake.disk[`${ROOT}/src/orders/cancel.ts`] = fake.tree['src/orders/cancel.ts']
  fake.reads.length = 0
  const third = await loadIndex(fake, ROOT, files)
  expect(fake.reads.filter(p => p !== cacheFile)).toEqual([`${ROOT}/src/orders/cancel.ts`])
  expect(third.defs.get('src/orders/cancel.ts')!.map(d => d.name)).toEqual(['cancelOrder'])
  // an uncommitted change: read every time, never kept
  fake.dirty.push('src/payments/legacy.py')
  fake.disk[`${ROOT}/src/payments/legacy.py`] = 'def refund_all():\n    pass\n'
  fake.reads.length = 0
  const fourth = await loadIndex(fake, ROOT, files)
  expect(fourth.defs.get('src/payments/legacy.py')!.map(d => d.name)).toEqual(['refund_all'])
  expect(JSON.parse(fake.disk[cacheFile]!).files['src/payments/legacy.py']).toBe(undefined)
  fake.reads.length = 0
  await loadIndex(fake, ROOT, files)
  expect(fake.reads.filter(p => p !== cacheFile)).toEqual([`${ROOT}/src/payments/legacy.py`])
  // a budget spent before anything is read: incomplete, and the next call goes on
  const cold = io({ tree: CODE })
  expect((await loadIndex(cold, ROOT, files, -1)).complete).toBe(false)
  expect((await loadIndex(cold, ROOT, files)).complete).toBe(true)
})

test('in a bench run each call is written to the ledger with how it was answered, and the index lives in the run\'s folder', async () => {
  const fake = io({ tree: CODE, env: { JEV_MOD_BENCH_OVERLAY: '/bench/overlay.json' } })
  fake.disk['/bench/overlay.json'] = JSON.stringify({ features: { 'find-files': { mode: 'on' } }, ledger: '/bench/ledger' })
  await find(fake, { symbol: 'refundPayment' })
  await find(fake, { query: 'send the money back for a payment', identifiers: ['refundPayment'] })
  await find(fake, {})
  const records = Object.entries(fake.disk).filter(([p]) => p.startsWith('/bench/ledger/tool-')).map(([, t]) => JSON.parse(t))
  expect(records.map(r => [r.kind, r.feature, r.how])).toEqual([['tool', 'find-files', 'symbol'], ['tool', 'find-files', expect.stringMatching(/^(jev|clear|local)$/)], ['tool', 'find-files', 'none']])
  expect(Object.keys(fake.disk).some(p => p.startsWith('/bench/ledger/find-files-cache/symbols-'))).toBe(true)
  expect(Object.keys(fake.disk).some(p => p.startsWith('/home/u/.cache/'))).toBe(false)
})

test('the tool\'s schema: query or symbol, with the model\'s extra words; the description says when to use it and when not', () => {
  expect(SPEC.inputSchema.required).toEqual([])
  expect(Object.keys(SPEC.inputSchema.properties)).toEqual(['query', 'identifiers', 'synonyms', 'symbol', 'path', 'limit'])
  expect(SPEC.description).toContain('when you do not know the names the code uses')
  expect(SPEC.description).toContain('Not for one exact string or a file name you already know')
  expect(SPEC.description).toContain('refundPayment never matches refundPaymentLater')
})

// Last: a failure starts the five-minute cool-off for the rest of this file's process.
test('a backend that fails: local, labelled; then the cool-off asks nothing', async () => {
  const down = await find(io({ backend: 'down', settings: { mode: 'on', shortcut: false } }), { query: 'retry backoff' })
  expect(down.split('\n')[0]).toContain('local ranking only (the decision backend failed: http_503)')
  const after = io({ settings: { mode: 'on', shortcut: false } })
  expect((await find(after, { query: 'retry backoff' })).split('\n')[0]).toContain('cooling off')
  expect(after.asked.length).toBe(0)
})
