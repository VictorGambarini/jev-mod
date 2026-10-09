import { test, expect, mock } from 'claude-code/testing'

// review-triage's tool through the kit: registered at session start only when the feature is
// on, then called as the model calls it and answered by register.tsx's hook. git is a fake
// process.run; the decision backend is a fake server named by TYPESAFE_BASE_URL, which never
// takes a provider key.

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,2 @@',
  ' const a = 1',
  '-const b = 2',
  '+const b = 3',
  '',
].join('\n')

function setUp(on: any, mode: string, sent: any[], registered: any[] = []) {
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
  on('session.id', async () => ({ value: 'review-triage-test' }))
  on('session.root', async () => ({ value: '/proj' }))
  on('fs.read', async (_$: unknown, e: { path: string }) => {
    if (e.path === '/cfg/jev-mod/config.json') return { value: JSON.stringify({ features: { 'review-triage': { mode } } }) }
    throw new Error('no such file')
  })
  on('fs.list', async () => { throw new Error('no such dir') })
  on('http.fetch', async (_$: unknown, e: { url: string; init?: { body?: string } }) => {
    const body = JSON.parse(e.init!.body!)
    sent.push(body)
    const answers = Object.fromEntries(Object.keys(body.questions).map((q: string) => [q, { type: 'noul', noul: 0.03 }]))
    return { value: { status: 200, ok: true, text: JSON.stringify({ answers, model: 'jev-test', usage: { input_tokens: 500 } }), headers: {} } }
  })
  on('process.run', async (_$: unknown, e: { argv: string[] }) => {
    const argv = e.argv
    if (argv[0] === 'git' && argv[3] === 'diff' && argv.includes('HEAD') && !argv.includes('HEAD~1')) {
      return { value: { exitCode: 0, stdout: DIFF, stderr: '' } }
    }
    if (argv[0] === 'git' && argv[3] === 'ls-files') return { value: { exitCode: 0, stdout: '', stderr: '' } }
    return { value: { exitCode: 1, stdout: '', stderr: '' } }
  })
  on('ui.status', async () => ({ value: undefined }))
}

const TOOL = 'mcp__jev-mod__review_triage'

test('on: the tool is offered at session start, says to call it before a review, and answers a verdict', async ($, on) => {
  const sent: any[] = []
  const registered: any[] = []
  setUp(on, 'on', sent, registered)
  await $.session.start({ cwd: '/proj', surface: null, isInteractive: false })
  expect(registered.map(t => t.name)).toEqual(['review_triage'])
  expect(registered[0].description).toContain('before you review it')
  expect(registered[0].description).toContain('never replaces the')
  expect(Object.keys(registered[0].inputSchema.properties)).toEqual(['base', 'paths', 'intent'])
  const ran: any = await $.tool.call({ tool: TOOL, intent: 'bump b' } as never)
  const text = String(ran.text ?? ran.result)
  expect(text.split('\n')[0]).toBe('verdict: quick')
  expect(text).toContain('diff: 1 file, +1 -1 (uncommitted changes vs HEAD)')
  expect(sent.length).toBe(1)
})

test('off: the tool is not offered', async ($, on) => {
  const registered: any[] = []
  setUp(on, 'off', [], registered)
  await $.session.start({ cwd: '/proj', surface: null, isInteractive: false })
  expect(registered).toEqual([])
})
