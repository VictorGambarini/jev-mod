import { test, expect } from 'claude-code/testing'
import type { AccessState } from '../../../types'
import type { IO } from '../../core/io'
import { run } from '../command'
import { check, open } from './index'

// The access gate's glue with a fake IO (a scratch config, no backend, no key): the modes, the
// session's allows set by /jev-mod access, host scopes, and alwaysAllow read from the user's
// file only.

const USER = '/home/u/.config/jev-mod/config.json'
const PROJECT = '/home/u/proj/.claude/jev-mod.json'
const PERSON = { kind: 'composer' }

type Fake = IO & { store: Record<string, unknown>; state: { value: AccessState | null }; session: { id: string } }

function io(user: Record<string, unknown> | null, project?: Record<string, unknown>): Fake {
  const files: Record<string, string> = {}
  if (user) files[USER] = JSON.stringify({ features: { 'access-gate': user } })
  if (project) files[PROJECT] = JSON.stringify({ features: { 'access-gate': project } })
  const store: Record<string, unknown> = {}
  const state = { value: null as AccessState | null }
  const session = { id: 'access-session' }
  const fake = {
    store, state, session,
    option: () => undefined,
    readFile: async (path: string) => { if (path in files) return files[path]; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    env: async () => undefined,
    home: async () => '/home/u',
    projectRoot: async () => '/home/u/proj',
    sessionId: async () => session.id,
    accessState: async () => state.value,
    setAccessState: async (value: AccessState) => { state.value = JSON.parse(JSON.stringify(value)) },
    storeGet: async (key: string) => store[key],
    storeSet: async (key: string, value: unknown) => { store[key] = value },
    status: () => {}, toast: () => {},
  }
  return fake as unknown as Fake
}

const bash = (command: string) => ({ tool: 'Bash', input: { command } })
const counts = (fake: Fake) =>
  (Object.values((fake.store.activity ?? {}) as Record<string, any>)[0]?.['access-gate'] ?? {}) as Record<string, number>
const settle = () => new Promise(r => setTimeout(r, 20))

test('on: an ssh to another machine is refused with a deny that tells the model to ask; git and localhost go on', async () => {
  const fake = io({ mode: 'on' })
  const gate = await check(fake, bash('ssh victor@vm1 "cd app && ./test.sh"'))
  expect(gate?.decision).toBe('deny')
  expect(gate?.reason).toContain('This session does not allow ssh')
  expect(gate?.reason).toContain('ssh victor@vm1')
  expect(gate?.reason).toContain('Ask the person to run it themselves, or to allow ssh for this session with /jev-mod access ssh on.')
  expect(await check(fake, bash('git push origin main'))).toBe(null)
  expect(await check(fake, bash('ssh localhost uptime'))).toBe(null)
  expect(await check(fake, bash('npm test'))).toBe(null)
  expect(await check(fake, { tool: 'Glob', input: { pattern: '~/.ssh/*' } })).toBe(null)
  await settle()
  expect(counts(fake).blocked).toBe(1)
})

test('off is the default and refuses nothing; shadow counts would-block and refuses nothing', async () => {
  expect(await check(io(null), bash('ssh vm1'))).toBe(null)
  expect(await check(io({ mode: 'off' }), bash('ssh vm1'))).toBe(null)
  const shadow = io({ mode: 'shadow' })
  expect(await check(shadow, bash('ssh vm1'))).toBe(null)
  expect(await check(shadow, { tool: 'Read', input: { file_path: '/home/u/.ssh/id_ed25519' } })).toBe(null)
  await settle()
  expect(counts(shadow)['would-block']).toBe(2)
  expect(counts(shadow).blocked).toBe(undefined)
})

test('/jev-mod access ssh on opens ssh for this session only; off and all off close it again', async () => {
  const fake = io({ mode: 'on' })
  const said = await run(fake, 'access ssh on', PERSON)
  expect(said.text).toContain('allowed this session')
  expect(await check(fake, bash('ssh vm1'))).toBe(null)
  expect(await check(fake, bash('scp a vm2:/tmp'))).toBe(null)
  expect((await check(fake, bash('ssh -L 5432:db:5432 vm1')))?.reason).toContain('does not allow tunnels') // another category
  expect(await open(fake)).toEqual(['ssh'])
  await settle()
  expect(counts(fake).allowed).toBe(2)

  await run(fake, 'access ssh off', PERSON)
  expect((await check(fake, bash('ssh vm1')))?.decision).toBe('deny')
  await run(fake, 'access ssh on', PERSON)
  await run(fake, 'access keys on', PERSON)
  expect(await open(fake)).toEqual(['ssh', 'keys'])
  await run(fake, 'access all off', PERSON)
  expect(await open(fake)).toEqual([])
  expect((await check(fake, bash('ssh vm1')))?.decision).toBe('deny')

  // a new session starts blocked: the allows were this session's
  await run(fake, 'access ssh on', PERSON)
  fake.session.id = 'the-next-session'
  expect((await check(fake, bash('ssh vm1')))?.decision).toBe('deny')
  expect(await open(fake)).toEqual([])
})

test('a host scope allows only the hosts named; a host it cannot read is refused', async () => {
  const fake = io({ mode: 'on' })
  await run(fake, 'access ssh on vm1', PERSON)
  expect(await check(fake, bash('ssh vm1 uptime'))).toBe(null)
  const other = await check(fake, bash('ssh vm2 uptime'))
  expect(other?.reason).toContain('does not allow ssh to vm2 (this session allows ssh only to vm1)')
  expect((await check(fake, bash('rsync -a -e ssh x/ y/')))?.decision).toBe('deny')
  await run(fake, 'access ssh on *.lab', PERSON)
  expect(await check(fake, bash('scp a build.lab:/tmp'))).toBe(null)
  expect(await open(fake)).toEqual(['ssh (vm1, *.lab)'])
  expect((await run(fake, 'access', PERSON)).text).toContain('allowed this session to vm1, *.lab')
})

test('only the person opens a category: a run that did not come from the prompt changes nothing', async () => {
  const fake = io({ mode: 'on' })
  expect((await run(fake, 'access ssh on', { kind: 'plugin' })).text).toContain('must be typed by the person at the prompt')
  expect((await run(fake, 'access ssh on')).text).toContain('must be typed by the person at the prompt')
  expect((await check(fake, bash('ssh vm1')))?.decision).toBe('deny')
  expect((await run(fake, 'access all on', PERSON)).text).toContain('name one category')
  // closing needs no person
  await run(fake, 'access ssh on', PERSON)
  await run(fake, 'access ssh off', { kind: 'plugin' })
  expect((await check(fake, bash('ssh vm1')))?.decision).toBe('deny')
})

test('alwaysAllow opens a category in every session, from the user file only, never a project file', async () => {
  const mine = io({ mode: 'on', alwaysAllow: 'remote-db,scanning' })
  expect(await check(mine, bash('psql -h db.prod.example app'))).toBe(null)
  expect(await check(mine, bash('nmap 10.0.0.1'))).toBe(null)
  expect((await check(mine, bash('ssh vm1')))?.decision).toBe('deny')
  expect(await open(mine)).toEqual(['remote-db', 'scanning'])
  const theirs = io({ mode: 'on' }, { alwaysAllow: 'ssh,keys' })
  expect((await check(theirs, bash('ssh vm1')))?.decision).toBe('deny')
  expect((await check(theirs, { tool: 'Read', input: { file_path: '~/.ssh/id_rsa' } }))?.decision).toBe('deny')
  // a project file may turn the gate on, never off
  expect((await check(io(null, { mode: 'on' }), bash('ssh vm1')))?.decision).toBe('deny')
  expect((await check(io({ mode: 'on' }, { mode: 'off' }), bash('ssh vm1')))?.decision).toBe('deny')
  // the command writes alwaysAllow to the user's file, checked
  const fake = io({ mode: 'on' })
  expect((await run(fake, 'access-gate alwaysAllow ssh,bogus')).text).toContain('must be a comma-separated list')
  expect((await run(fake, 'access-gate alwaysAllow tunnels ssh')).text).toContain('access-gate.alwaysAllow is ssh,tunnels')
  expect(await check(fake, bash('ssh -D 1080 vm1'))).toBe(null)
  expect((await run(fake, 'access-gate alwaysAllow ssh --project')).text).toContain('only your own file sets its settings')
})

test('allowLocalhost false: ssh to this machine is refused too', async () => {
  const fake = io({ mode: 'on', allowLocalhost: false })
  expect((await check(fake, bash('ssh localhost')))?.decision).toBe('deny')
})

test('Read of a private key is refused, its .pub is not; an MCP ssh tool is refused', async () => {
  const fake = io({ mode: 'on' })
  expect((await check(fake, { tool: 'Read', input: { file_path: '/home/u/.ssh/id_ed25519' } }))?.reason).toContain('does not allow keys')
  expect(await check(fake, { tool: 'Read', input: { file_path: '/home/u/.ssh/id_ed25519.pub' } })).toBe(null)
  expect((await check(fake, { tool: 'Edit', input: { file_path: '/home/u/.ssh/authorized_keys', old_string: '', new_string: 'x' } }))?.decision).toBe('deny')
  expect((await check(fake, { tool: 'mcp__ssh-box__run_command', input: { host: 'vm1', command: 'ls' } }))?.reason).toContain('does not allow ssh')
})

test('/jev-mod access shows each category and the mode; a bad category or word says how', async () => {
  const fake = io({ mode: 'shadow' })
  const shown = (await run(fake, 'access', PERSON)).text
  expect(shown).toContain('access gate: shadow')
  expect(shown).toContain('remote-desktop')
  expect(shown.split('\n').filter(l => /^\S+\s+blocked\s/.test(l)).length).toBe(9)
  expect((await run(fake, 'access sssh on', PERSON)).text).toContain('no access category sssh')
  expect((await run(fake, 'access ssh maybe', PERSON)).text).toContain('access takes a category and on or off')
  expect((await run(fake, 'access ssh off vm1', PERSON)).text).toContain('access takes a category and on or off')
})
