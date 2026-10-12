import { test, expect, mock } from 'claude-code/testing'

// find-files' tool through the kit: registered at session start when the feature is on, then
// called as the model calls it, answered by register.tsx's hook. The project is a fake tree
// (fs.list, fs.read) outside any git repository, so the listing is the walk; the decision
// backend is a fake server named by TYPESAFE_BASE_URL, which never takes a provider key.

const TREE: Record<string, string> = {
  '/proj/src/net/retry.ts': '// Retries a request with exponential backoff.\nexport async function withBackoff() {}\n',
  '/proj/src/net/client.ts': "// The HTTP client.\nimport { withBackoff } from './retry'\nexport function get() {}\n",
  '/proj/src/ui/button.tsx': '// A button.\nexport function Button() {}\n',
  '/proj/node_modules/retry/index.js': '// retry backoff\n',
}

function setUp(on: any, mode: string | Record<string, unknown>, sent: any[], registered: any[] = [], files: Record<string, string> = {}) {
  mock.store(on)
  mock.clock(on, { now: Date.now() }) // held waits: the request's deadline never fires
  on('session.start', async (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', async (_$: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('tool.register', async (_$: unknown, e: { name: string }) => {
    registered.push(e)
    return { value: { tool: `mcp__jev-mod__${e.name}` } }
  })
  // beneath the mod: reached only if its hook passed the call on
  on('tool.call', async () => ({ deny: 'the call reached the engine' }))
  mock.env(on, { HOME: '/home/t', XDG_CONFIG_HOME: '/cfg', JEV_HOME: '/jev', JEV_LIMITS: 'off',
    TYPESAFE_BASE_URL: 'https://jev.test' })
  on('session.id', async () => ({ value: 'find-files-test' }))
  on('session.root', async () => ({ value: '/proj' }))
  on('fs.read', async (_$: unknown, e: { path: string }) => {
    if (e.path === '/cfg/jev-mod/config.json') return { value: JSON.stringify({ features: { 'find-files': typeof mode === 'string' ? { mode } : mode } }) }
    if (e.path in files) return { value: files[e.path] }
    if (e.path in TREE) return { value: TREE[e.path] }
    throw new Error('no such file')
  })
  on('fs.list', async (_$: unknown, e: { path: string }) => {
    const prefix = `${e.path.replace(/\/$/, '')}/`
    const below = Object.keys(TREE).filter(p => p.startsWith(prefix)).map(p => p.slice(prefix.length))
    if (!below.length) throw new Error('no such dir')
    const names = [...new Set(below.map(p => p.split('/')[0]!))]
    return { value: names.map(name => ({ name, kind: below.includes(name) ? 'file' : 'dir', isLink: false, mtimeMs: 0 })) }
  })
  on('http.fetch', async (_$: unknown, e: { url: string; init?: { body?: string } }) => {
    const body = JSON.parse(e.init!.body!)
    sent.push(body)
    const answers = Object.fromEntries(Object.keys(body.questions).map((q: string) => {
      const card: string = body.state.files[`F${q.slice(1)}`]
      const choice = card.includes('retry.ts') ? 'implements' : card.includes('withBackoff') ? 'related' : 'unrelated'
      return [q, { type: 'choice', choice, probabilities: { implements: 0.05, related: 0.05, unrelated: 0.05, [choice]: 0.9 }, confidence: 0.9 }]
    }))
    return { value: { status: 200, ok: true, text: JSON.stringify({ answers, model: 'jev-test', usage: { input_tokens: 500 } }), headers: {} } }
  })
  on('process.run', async () => ({ value: { exitCode: 128, stdout: '', stderr: 'not a git repository' } }))
  on('ui.status', async () => ({ value: undefined }))
}

const TOOL = 'mcp__jev-mod__find_files'

test('on: the tool is offered at session start and answers with the decision model\'s ranking', async ($, on) => {
  const sent: any[] = []
  const registered: any[] = []
  setUp(on, { mode: 'on', shortcut: false }, sent, registered) // the shortcut would answer this one locally
  await $.session.start({ cwd: '/proj', surface: null, isInteractive: false })
  expect(registered.map(t => t.name)).toEqual(['find_files'])
  expect(registered[0].inputSchema.required).toEqual([])
  expect(Object.keys(registered[0].inputSchema.properties)).toContain('symbol')
  const ran: any = await $.tool.call({ tool: TOOL, query: 'retries with exponential backoff' } as never)
  const text = String(ran.text ?? ran.result)
  expect(text.split('\n')[0]).toContain('ranked by the decision model')
  expect(text.split('\n')[1]).toBe('1. src/net/retry.ts [implements 0.90] Retries a request with exponential backoff.')
  expect(text).toContain('src/net/client.ts [related 0.90]') // the walk read its head
  expect(text).not.toContain('node_modules')
  expect(sent.length).toBe(1)
})

test('off: the tool is not offered', async ($, on) => {
  const registered: any[] = []
  setUp(on, 'off', [], registered)
  await $.session.start({ cwd: '/proj', surface: null, isInteractive: false })
  expect(registered).toEqual([])
})

// Contact details reach the decision model unless the person (/config) or the project turns
// redact_contacts on; register.tsx sets it once for every feature. A card number is masked either way
// (a key in the query would stop it being sent at all).
const QUERY = 'retries with exponential backoff, ask ana@example.com or +64 21 123 4567, card 4111 1111 1111 1111'

async function sentQuery($: any, on: any, files: Record<string, string> = {}): Promise<string> {
  const sent: any[] = []
  setUp(on, 'on', sent, [], files)
  await $.session.start({ cwd: '/proj', surface: null, isInteractive: false })
  await $.tool.call({ tool: TOOL, query: QUERY } as never)
  expect(sent.length).toBe(1)
  return String(sent[0].state.query)
}

test('contact details go to the decision model by default; a card number never does', async ($, on) => {
  expect(await sentQuery($, on)).toBe('retries with exponential backoff, ask ana@example.com or +64 21 123 4567, card [card]')
})

test('redact_contacts on in /config masks them for every feature', { options: { redact_contacts: true } }, async ($, on) => {
  expect(await sentQuery($, on)).toBe('retries with exponential backoff, ask [email] or [phone], card [card]')
})

test('a project may turn redact_contacts on, never off', async ($, on) => {
  expect(await sentQuery($, on, { '/proj/.claude/jev-mod.json': JSON.stringify({ redactContacts: true }) }))
    .toBe('retries with exponential backoff, ask [email] or [phone], card [card]')
})

test('a project\'s redactContacts: false leaves /config\'s on standing', { options: { redact_contacts: true } }, async ($, on) => {
  expect(await sentQuery($, on, { '/proj/.claude/jev-mod.json': JSON.stringify({ redactContacts: false }) }))
    .toBe('retries with exponential backoff, ask [email] or [phone], card [card]')
})

test('a symbol through the kit: definitions and uses read from the code, no request sent', async ($, on) => {
  const sent: any[] = []
  setUp(on, 'on', sent)
  await $.session.start({ cwd: '/proj', surface: null, isInteractive: false })
  const ran: any = await $.tool.call({ tool: TOOL, symbol: 'withBackoff' } as never)
  const text = String(ran.text ?? ran.result)
  // no git and no ripgrep here: every code file was read; node_modules was never walked
  expect(text.split('\n')[0]).toBe('withBackoff in /proj: 1 definition, 0 calls, 0 other uses, 1 import; in code only (not in comments or strings, not inside longer names); 3 files searched (read).')
  expect(text).toContain('  src/net/retry.ts:2 (function)  export async function withBackoff() {}')
  expect(text).toContain("  src/net/client.ts:2  import { withBackoff } from './retry'")
  expect(sent.length).toBe(0)
})
