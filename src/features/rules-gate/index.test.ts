import { test, expect } from 'claude-code/testing'
import { settled } from '../../core/background'
import type { FetchInit, IO } from '../../core/io'
import { check, rulesFor } from './index'

// The rules gate's glue with a fake IO and a fake backend (no key of anyone's, no real config):
// rule files found from the root down, the edit refused in on, never held up in shadow, and
// every failure letting the edit go on.

const USER = '/home/u/.config/jev-mod/config.json'
const ROOT = '/home/u/proj'

const PROJECT_FILES: Record<string, string> = {
  [`${ROOT}/CLAUDE.md`]: '# Rules\n\n- Never use `var` in TypeScript.\n- Keep the README in step with the registry.\n',
  [`${ROOT}/src/AGENTS.md`]: '## Source\n\n1. Every exported function has a doc comment.\n',
  [`${ROOT}/.claude/rules/tests.md`]: '---\npaths:\n  - "**/*.test.ts"\n---\n- Tests never touch the real config file.\n',
  [`${ROOT}/.claude/rules/general.md`]: '- Write comments in plain English.\n',
  [`${ROOT}/src/a.ts`]: 'export const a = 1\n',
}

type Fake = IO & { store: Record<string, unknown>; bodies: any[]; disk: Record<string, string> }

function io(mode: string, opts: {
  knobs?: Record<string, unknown>
  broken?: (instructions: string) => number
  gate?: () => Promise<void>
  env?: Record<string, string>
  option?: Record<string, unknown>
  sleep?: (ms: number) => Promise<void>
} = {}): Fake {
  const files: Record<string, string> = {
    ...PROJECT_FILES,
    [USER]: JSON.stringify({ features: { 'rules-gate': { mode, ...opts.knobs } } }),
  }
  const store: Record<string, unknown> = {}
  const env: Record<string, string> = opts.env ?? { JEV_HOME: '/jev', JEV_LIMITS: 'off', TYPESAFE_API_KEY: 'test-not-a-key' }
  const under = (dir: string) => Object.keys(files).filter(p => p.startsWith(dir + '/')).map(p => p.slice(dir.length + 1))
  const fake = {
    store, disk: files, bodies: [] as any[],
    option: (name: string) => opts.option?.[name],
    readFile: async (path: string) => { if (path in files) return files[path]; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    // a file's mtime moves with its length, so an edited rule file is read again
    files: async (dir: string) => under(dir).filter(r => !r.includes('/')).map(name => ({ name, mtimeMs: files[`${dir}/${name}`]!.length })),
    folders: async (dir: string) => [...new Set(under(dir).filter(r => r.includes('/')).map(r => r.split('/')[0]!))],
    env: async (name: string) => env[name],
    home: async () => '/home/u',
    projectRoot: async () => ROOT,
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
    sleep: opts.sleep ?? (() => new Promise<void>(() => {})),
    sessionId: async () => 'rules-session',
    storeGet: async (key: string) => store[key],
    storeSet: async (key: string, value: unknown) => { store[key] = value },
    status: () => {}, toast: () => {},
    fetch: async (_url: string, init?: FetchInit) => {
      const body = JSON.parse(init!.body!)
      fake.bodies.push(body)
      if (opts.gate) await opts.gate()
      const answers = Object.fromEntries(Object.entries(body.questions as Record<string, { instructions: string }>)
        .map(([id, q]) => [id, { type: 'noul', noul: (opts.broken ?? (() => 0.1))(q.instructions) }]))
      return { status: 200, ok: true, text: JSON.stringify({ answers, model: 'jev-test', usage: { input_tokens: 10 } }) }
    },
  }
  return fake as unknown as Fake
}

const counts = (fake: Fake) =>
  (Object.values((fake.store.activity ?? {}) as Record<string, any>)[0]?.['rules-gate'] ?? {}) as Record<string, number>

const breaksVar = (q: string) => (q.includes('Never use `var`') ? 0.92 : 0.05)
const edit = (file: string, old_string: string, new_string: string, agentId?: string) =>
  ({ tool: 'Edit', input: { file_path: file, old_string, new_string }, agentId })

test('the rule files that apply: CLAUDE.md and AGENTS.md from the root down, .claude/rules by its paths', async () => {
  const fake = io('on')
  const src = await rulesFor(fake, ROOT, 'src/a.ts')
  expect(src.map(r => `${r.source}: ${r.text}`)).toEqual([
    'CLAUDE.md: Never use `var` in TypeScript.',
    'CLAUDE.md: Keep the README in step with the registry.',
    'src/AGENTS.md: Every exported function has a doc comment.',
    '.claude/rules/general.md: Write comments in plain English.',
  ])
  expect(src.map(r => r.distance)).toEqual([1, 1, 0, 1])
  const testFile = await rulesFor(fake, ROOT, 'src/a.test.ts')
  expect(testFile.some(r => r.source === '.claude/rules/tests.md' && r.distance === 0)).toBe(true)
  const top = await rulesFor(fake, ROOT, 'README.md')
  expect(top.some(r => r.source === 'src/AGENTS.md')).toBe(false)
})

test('on: a rule judged broken refuses the edit, quoting the rule and its file; one question per rule', async () => {
  const fake = io('on', { broken: breaksVar })
  const gate = await check(fake, edit(`${ROOT}/src/a.ts`, 'export const a = 1', 'export var a = 1'))
  expect(gate?.decision).toBe('deny')
  expect(gate!.reason).toContain('this edit to src/a.ts was not made')
  expect(gate!.reason).toContain('- "Never use `var` in TypeScript." (CLAUDE.md, under "Rules")')
  expect(gate!.reason.includes('doc comment')).toBe(false)
  expect(fake.bodies.length).toBe(1)
  const body = fake.bodies[0]
  expect(Object.keys(body.questions)).toEqual(['rule_1', 'rule_2', 'rule_3', 'rule_4'])
  expect(body.state.file).toBe('src/a.ts')
  expect(body.state.change).toEqual({ old_string: 'export const a = 1', new_string: 'export var a = 1' })
  expect(counts(fake).blocked).toBe(1)
  expect(counts(fake).asked).toBe(1)
})

test('on: below minConfidence the edit goes on and is counted passed; the threshold is a knob', async () => {
  const fake = io('on', { broken: q => (q.includes('`var`') ? 0.79 : 0.1) })
  expect(await check(fake, edit(`${ROOT}/src/a.ts`, 'const', 'var'))).toBe(null)
  expect(counts(fake).passed).toBe(1)
  const lower = io('on', { broken: q => (q.includes('`var`') ? 0.79 : 0.1), knobs: { minConfidence: 0.75 } })
  expect((await check(lower, edit(`${ROOT}/src/a.ts`, 'const', 'var')))?.decision).toBe('deny')
})

test('a Write to an existing file sends the lines that differ; a new file is sent whole', async () => {
  const fake = io('on')
  await check(fake, { tool: 'Write', input: { file_path: 'src/a.ts', content: 'export const a = 2\n' } })
  expect(fake.bodies[0].state.change).toEqual({ diff: '@@ line 1 @@\n-export const a = 1\n+export const a = 2\n ' })
  await check(fake, { tool: 'Write', input: { file_path: `${ROOT}/src/new.ts`, content: 'export const b = 1\n' } })
  expect(fake.bodies[1].state.change).toEqual({ new_file: 'export const b = 1\n' })
})

test('shadow returns before a slow backend answers, never refuses, and counts would-block once', async () => {
  let release: () => void = () => {}
  const slow = new Promise<void>(r => { release = r })
  const fake = io('shadow', { broken: breaksVar, gate: () => slow })
  const started = Date.now()
  expect(await check(fake, edit(`${ROOT}/src/a.ts`, 'const', 'var'))).toBe(null)
  expect(Date.now() - started).toBeLessThan(1000)
  expect(counts(fake)['would-block']).toBe(undefined)
  release()
  await settled()
  await new Promise(r => setTimeout(r, 10))
  expect(fake.bodies.length).toBe(1)
  expect(counts(fake)['would-block']).toBe(1)
  expect(counts(fake).blocked).toBe(undefined)
})

test('off, a non-edit tool, a file outside the project, or a file with no rules: nothing sent, nothing counted', async () => {
  const off = io('off', { broken: breaksVar })
  expect(await check(off, edit(`${ROOT}/src/a.ts`, 'const', 'var'))).toBe(null)
  const on = io('on', { broken: breaksVar })
  expect(await check(on, { tool: 'Bash', input: { command: 'echo var > src/a.ts' } })).toBe(null)
  expect(await check(on, edit('/home/u/elsewhere/a.ts', 'const', 'var'))).toBe(null)
  expect(await check(on, edit(`${ROOT}/../other/a.ts`, 'const', 'var'))).toBe(null)
  const bare = io('on', { broken: breaksVar })
  for (const path of Object.keys(PROJECT_FILES)) if (!path.endsWith('a.ts')) delete bare.disk[path]
  expect(await check(bare, edit(`${ROOT}/src/a.ts`, 'const', 'var'))).toBe(null)
  await settled()
  expect(off.bodies.length + on.bodies.length + bare.bodies.length).toBe(0)
  expect(counts(off)).toEqual({})
  expect(counts(on)).toEqual({})
  expect(counts(bare)).toEqual({})
})

test('subagents: judged by default, left alone when the knob is false', async () => {
  const fake = io('on', { broken: breaksVar })
  expect((await check(fake, edit(`${ROOT}/src/a.ts`, 'const', 'var', 'agent-1')))?.decision).toBe('deny')
  expect(fake.bodies[0].state.made_by).toBe('a subagent the agent started')
  const not = io('on', { broken: breaksVar, knobs: { subagents: false } })
  expect(await check(not, edit(`${ROOT}/src/a.ts`, 'const', 'var', 'agent-1'))).toBe(null)
  expect(not.bodies.length).toBe(0)
})

test('fail open: a secret in the change, private mode, or no key lets the edit go on, counted skipped', async () => {
  const secret = io('on', { broken: () => 1 })
  expect(await check(secret, edit(`${ROOT}/src/a.ts`, '', 'const password = "hunter22"'))).toBe(null)
  expect(secret.bodies.length).toBe(0)
  expect(counts(secret).skipped).toBe(1)

  const quiet = io('on', { broken: () => 1, option: { private: true } })
  expect(await check(quiet, edit(`${ROOT}/src/a.ts`, 'const', 'var'))).toBe(null)
  expect(quiet.bodies.length).toBe(0)
  expect(counts(quiet).skipped).toBe(1)

  const keyless = io('on', { broken: () => 1, env: { JEV_HOME: '/jev', JEV_LIMITS: 'off' } })
  expect(await check(keyless, edit(`${ROOT}/src/a.ts`, 'const', 'var'))).toBe(null)
  expect(keyless.bodies.length).toBe(0)
  expect(counts(keyless).skipped).toBe(1)
})

test('a rule that looks like it holds a secret is never sent; the others still are', async () => {
  const fake = io('on')
  fake.disk[`${ROOT}/CLAUDE.md`] += '- The staging password is hunter22, never print it.\n'
  await check(fake, edit(`${ROOT}/src/a.ts`, 'const', 'let'))
  expect(fake.bodies.length).toBe(1)
  expect(JSON.stringify(fake.bodies[0]).includes('hunter22')).toBe(false)
  expect(Object.keys(fake.bodies[0].questions).length).toBe(4)
})

test('a project file may make the gate stricter, never looser, and sets none of its knobs', async () => {
  const project = `${ROOT}/.claude/jev-mod.json`
  const cloned = JSON.stringify({ features: { 'rules-gate': { mode: 'off', minConfidence: 0.5, subagents: false } } })
  const fake = io('on', { broken: q => (q.includes('`var`') ? 0.79 : 0.1) })
  fake.disk[project] = cloned
  expect(await check(fake, edit(`${ROOT}/src/a.ts`, 'const', 'var', 'agent-1'))).toBe(null) // still on: judged, and passed at 0.8
  expect(fake.bodies.length).toBe(1)
  expect(counts(fake).passed).toBe(1)
  const stricter = io('off', { broken: breaksVar })
  stricter.disk[project] = JSON.stringify({ features: { 'rules-gate': { mode: 'on' } } })
  expect((await check(stricter, edit(`${ROOT}/src/a.ts`, 'const', 'var')))?.decision).toBe('deny')
})

// Last: a timeout starts the backend cool-off for this module, which would skip the tests after it.
test('fail open: no answer within timeoutMs lets the edit go on, counted skipped', async () => {
  const fake = io('on', {
    broken: () => 1, knobs: { timeoutMs: 1000 },
    gate: () => new Promise<void>(() => {}),
    sleep: ms => new Promise<void>(r => setTimeout(r, ms)),
  })
  const started = Date.now()
  expect(await check(fake, edit(`${ROOT}/src/a.ts`, 'const', 'var'))).toBe(null)
  expect(Date.now() - started).toBeLessThan(2500)
  expect(counts(fake).skipped).toBe(1)
  expect(counts(fake).blocked).toBe(undefined)
})
