import { test, expect, mock } from 'claude-code/testing'

// How often a hook reads the config files. In Claude Code each fs.read is a round trip to the
// host, so a hook that looks a setting up twenty times pays twenty trips for one file. The mod
// reads each file at most once per hook call (core/reads.ts); these pin a ceiling per hook so a
// new lookup cannot quietly bring the repeats back. The files are fakes; nothing reaches a backend.

const FILES: Record<string, string> = {
  '/cfg/jev-mod/config.json': JSON.stringify({ features: {
    'access-gate': { mode: 'on' }, 'tool-gate': { mode: 'on' }, 'rules-gate': { mode: 'on' }, routing: { mode: 'on' },
    skills: { mode: 'on' }, 'review-triage': { mode: 'on' }, screening: { mode: 'on' },
  } }),
}
const ORIGINAL = FILES['/cfg/jev-mod/config.json']!

let reads: Record<string, number> = {}
const total = () => Object.values(reads).reduce((a, b) => a + b, 0)
// the daily counter (limits.state.json) is read fresh on purpose: every decision changes it
const worst = () => Math.max(0, ...Object.entries(reads).filter(([path]) => !path.endsWith('limits.state.json')).map(([, n]) => n))

function setUp(on: any) {
  reads = {}
  FILES['/cfg/jev-mod/config.json'] = ORIGINAL
  mock.store(on)
  mock.env(on, { HOME: '/home/t', XDG_CONFIG_HOME: '/cfg', JEV_HOME: '/jev', JEV_LIMITS: 'off' })
  on('session.id', async () => ({ value: 'config-reads-test' }))
  on('session.root', async () => ({ value: '/proj' }))
  on('fs.read', async (_$: unknown, e: { path: string }) => {
    reads[e.path] = (reads[e.path] ?? 0) + 1
    if (e.path in FILES) return { value: FILES[e.path] }
    throw new Error('no such file')
  })
  on('fs.write', async (_$: unknown, e: { path: string; text: string }) => {
    if (e.path in FILES) FILES[e.path] = e.text
    return { value: undefined }
  })
  on('fs.list', async () => { throw new Error('no such dir') })
  on('http.fetch', async () => { throw new Error('no network in tests') })
  on('process.run', async () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }))
  on('ui.status', async () => ({ value: undefined }))
  on('session.usage', async () => ({ value: { context: { tokens: 1000, window: 200_000, percent: 0.5 } } }))
  on('prompt.submit', async (_$: unknown, e: unknown) => e)
  on('tool.check', async () => ({ decision: 'allow' }))
  on('command.run', async () => ({ text: 'the command reached the engine' }))
}

const remote = { tool: 'Bash', input: { command: 'ssh victor@vm1 uptime' }, tool_use_id: 'toolu_1' }

test('a /jev-mod command that opens access reads each file once', { timeoutMs: 15000 }, async ($, on) => {
  setUp(on)
  await $.command.run({ command: 'jev-mod', args: 'access ssh on', origin: { kind: 'composer' } } as never)
  console.log('command reads', total(), JSON.stringify(reads))
  expect(worst()).toBeLessThanOrEqual(1)
  expect(total()).toBeLessThanOrEqual(10)
})

test('a tool.check reads each file once', { timeoutMs: 15000 }, async ($, on) => {
  setUp(on)
  await $.tool.check(remote as never)
  console.log('tool.check reads', total(), JSON.stringify(reads))
  expect(worst()).toBeLessThanOrEqual(1)
  expect(total()).toBeLessThanOrEqual(10)
  reads = {}
  await $.tool.check({ tool: 'Bash', input: { command: 'git push' }, tool_use_id: 'toolu_2' } as never)
  console.log('tool.check (git push) reads', total(), JSON.stringify(reads))
  expect(worst()).toBeLessThanOrEqual(1)
})

test('a prompt with several features on reads each file once', { timeoutMs: 20000 }, async ($, on) => {
  setUp(on)
  await $.prompt.submit({ text: 'please refactor the parser module and add tests' } as never)
  console.log('prompt.submit reads', total(), JSON.stringify(reads))
  expect(worst()).toBeLessThanOrEqual(1)
  expect(total()).toBeLessThanOrEqual(28)
})

test('an edit made between two hooks is seen by the second', { timeoutMs: 15000 }, async ($, on) => {
  setUp(on)
  expect(((await $.tool.check(remote as never)) as any).decision).toBe('deny')
  FILES['/cfg/jev-mod/config.json'] = JSON.stringify({ features: { 'access-gate': { mode: 'off' } } })
  expect(((await $.tool.check(remote as never)) as any).decision).toBe('allow')
})

test('a tool.call through screening and trimming reads each file once', { timeoutMs: 20000 }, async ($, on) => {
  setUp(on)
  on('tool.call', async () => ({ result: 'total 0\nok' }))
  await $.tool.call({ tool: 'Bash', command: 'ls -l' } as never)
  console.log('tool.call reads', total(), JSON.stringify(reads))
  expect(worst()).toBeLessThanOrEqual(1)
  expect(total()).toBeLessThanOrEqual(28)
})
