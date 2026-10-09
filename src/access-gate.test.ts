import { test, expect, mock } from 'claude-code/testing'

// The access gate through the kit: register.tsx's tool.check hook refuses an ssh the session has
// not allowed, /jev-mod access (typed by the person) opens it in the host's session state, and the
// band shows it open. The config is a fake fs.read; nothing reaches a backend.

function setUp(on: any, mode: string) {
  mock.store(on)
  mock.env(on, { HOME: '/home/t', XDG_CONFIG_HOME: '/cfg', JEV_HOME: '/jev', JEV_LIMITS: 'off' })
  on('session.id', async () => ({ value: 'access-gate-test' }))
  on('session.root', async () => ({ value: '/proj' }))
  on('fs.read', async (_$: unknown, e: { path: string }) => {
    if (e.path === '/cfg/jev-mod/config.json') return { value: JSON.stringify({ features: { 'access-gate': { mode } } }) }
    throw new Error('no such file')
  })
  on('fs.list', async () => { throw new Error('no such dir') })
  on('http.fetch', async () => { throw new Error('no network in tests') })
  // beneath the mod: Claude Code's own verdict allows every call
  on('tool.check', async () => ({ decision: 'allow' }))
  on('command.run', async () => ({ text: 'the command reached the engine' }))
}

const ssh = { tool: 'Bash', input: { command: 'ssh victor@vm1 uptime' }, tool_use_id: 'toolu_1' }

test('on: ssh is refused until the person allows it for the session, and the band shows it open', { timeoutMs: 15000 }, async ($, on) => {
  setUp(on, 'on')
  const refused: any = await $.tool.check(ssh as never)
  expect(refused.decision).toBe('deny')
  expect(String(refused.reason)).toContain('/jev-mod access ssh on')
  const allowed: any = await $.tool.check({ tool: 'Bash', input: { command: 'git push' }, tool_use_id: 'toolu_2' } as never)
  expect(allowed.decision).toBe('allow')

  const said: any = await $.command.run({ command: 'jev-mod', args: 'access ssh on', origin: { kind: 'composer' } } as never)
  expect(String(said.text)).toContain('allowed this session')
  expect((await $.tool.check({ ...ssh, tool_use_id: 'toolu_3' } as never) as any).decision).toBe('allow')
  const mounted = await $.ui.mount({ plugin: 'jev-mod', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  expect(JSON.stringify(await mounted.drawn())).toContain('🔓 ssh')

  await $.command.run({ command: 'jev-mod', args: 'access all off', origin: { kind: 'composer' } } as never)
  expect((await $.tool.check({ ...ssh, tool_use_id: 'toolu_4' } as never) as any).decision).toBe('deny')
})

test('a plugin running /jev-mod access ssh on opens nothing', async ($, on) => {
  setUp(on, 'on')
  const said: any = await $.command.run({ command: 'jev-mod', args: 'access ssh on', origin: { kind: 'plugin', name: 'other' } } as never)
  expect(String(said.text)).toContain('must be typed by the person')
  expect((await $.tool.check(ssh as never) as any).decision).toBe('deny')
})

test('off: nothing is refused', async ($, on) => {
  setUp(on, 'off')
  expect((await $.tool.check(ssh as never) as any).decision).toBe('allow')
})
