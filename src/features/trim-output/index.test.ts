import { test, expect } from 'claude-code/testing'
import type { FetchInit, IO } from '../../core/io'
import { noteGoal, trim } from './index'

const USER = '/home/u/.config/jev-mod/config.json'
const ARCHIVE = '/home/u/.cache/jev-mod/outputs'

type Fake = IO & { files: Record<string, string>; store: Record<string, unknown>; asked: { state: any; questions: Record<string, unknown> }[] }

/** A fake IO; `need` answers each chunk the decision model is asked about (none: no backend at all). */
function io(settings: Record<string, unknown>, need?: (chunk: string) => number): Fake {
  const files: Record<string, string> = { [USER]: JSON.stringify({ features: { 'trim-output': settings } }) }
  const store: Record<string, unknown> = {}
  const asked: Fake['asked'] = []
  const env: Record<string, string> = { JEV_HOME: '/jev', JEV_LIMITS: 'off', ...(need ? { TYPESAFE_API_KEY: 'test-not-a-key' } : {}) }
  return {
    files, store, asked,
    option: () => undefined,
    readFile: async (path: string) => { if (path in files) return files[path]; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    folders: async () => [],
    env: async (name: string) => env[name],
    home: async () => '/home/u',
    projectRoot: async () => undefined,
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
    sleep: () => new Promise<void>(() => {}),
    sessionId: async () => 's1',
    storeGet: async (key: string) => store[key],
    storeSet: async (key: string, value: unknown) => { store[key] = value },
    status: () => {}, toast: () => {},
    fetch: async (_url: string, init?: FetchInit) => {
      if (!need) return { status: 503, ok: false, text: '' }
      const body = JSON.parse(init!.body!)
      asked.push(body)
      const answers = Object.fromEntries(Object.keys(body.questions).map(q => [q, { type: 'noul', noul: need(body.state.chunks[`C${q.slice(1)}`]) }]))
      return { status: 200, ok: true, text: JSON.stringify({ answers, model: 'jev-test', usage: { input_tokens: 1000 } }) }
    },
  } as unknown as Fake
}

const numbered = Array.from({ length: 5000 }, (_, i) => `line ${i + 1}`).join('\n') + '\nERROR: boom\n'
const bash = (stdout: string, extra: Record<string, unknown> = {}) => ({ stdout, stderr: '', interrupted: false, isImage: false, ...extra })

test('on, local only: the output is folded, the original archived, and the header names it', async () => {
  const fake = io({ mode: 'on', localOnly: true }, () => 0)
  const out = await trim(fake, { command: 'seq', subagent: false }, bash(numbered)) as { stdout: string }
  const lines = out.stdout.split('\n')
  expect(lines[0]).toBe(`[jev-mod trimmed this output from 5001 to 10 lines; the full output is in ${ARCHIVE}/1.txt]`)
  expect(lines[lines.length - 1]).toBe('ERROR: boom')
  expect(out.stdout).toContain(`[jev-mod: 4992 similar lines folded — ${ARCHIVE}/1.txt lines 4–4995]`)
  expect(fake.files[`${ARCHIVE}/1.txt`]).toBe(numbered)
  expect(fake.asked.length).toBe(0) // localOnly sends nothing
  // the next output goes to the next file of the ring
  await trim(fake, { command: 'seq', subagent: false }, bash(numbered))
  expect(`${ARCHIVE}/2.txt` in fake.files).toBe(true)
})

test('a failed command (one string) is trimmed too; short outputs and off are left alone', async () => {
  const fake = io({ mode: 'on', localOnly: true })
  const failed = `Exit code 1\n${numbered}`
  const out = await trim(fake, { command: 'make', subagent: false }, failed) as { stdout: string; stderr: string }
  expect(out.stdout.split('\n')[1]).toBe('Exit code 1') // as Bash's record, which is what the hook may answer
  expect(out.stderr).toBe('')
  expect(out.stdout.length).toBeLessThan(1000)
  expect(await trim(fake, { command: 'ls', subagent: false }, bash('a\nb\nc\n'))).toBe(null)
  expect(await trim(io({ mode: 'off' }), { command: 'seq', subagent: false }, bash(numbered))).toBe(null)
  expect(await trim(fake, { command: 'seq', subagent: false }, bash(numbered, { backgroundTaskId: 'b1' }))).toBe(null)
})

test('shadow changes nothing and writes no archive, but counts what it would have saved', async () => {
  const fake = io({ mode: 'shadow', localOnly: true })
  expect(await trim(fake, { command: 'seq', subagent: false }, bash(numbered))).toBe(null)
  expect(Object.keys(fake.files).some(p => p.startsWith(ARCHIVE))).toBe(false)
  await new Promise(r => setTimeout(r, 10))
  const today = Object.values(fake.store.activity as Record<string, any>)[0]['trim-output']
  expect(today['would-trim']).toBe(1)
  expect(today['would-save-chars']).toBeGreaterThan(40_000)
})

test('a persisted output is read whole from its file, and the persisted fields go', async () => {
  const fake = io({ mode: 'on', localOnly: true })
  fake.files['/tool-results/x.txt'] = numbered
  const out = await trim(fake, { command: 'seq', subagent: false },
    bash(numbered.slice(0, 30_000), { persistedOutputPath: '/tool-results/x.txt', persistedOutputSize: numbered.length })) as Record<string, unknown>
  expect('persistedOutputPath' in out).toBe(false)
  expect(String(out.stdout)).toContain('ERROR: boom')
})

test('with the decision model: unneeded chunks are omitted, failures and the goal survive', async () => {
  const lines = ['$ npx vitest run', ' RUN  v1.6.0 /app', '']
  for (let f = 0; f < 40; f++) {
    lines.push(` ✓ src/m${f}.test.ts (5 tests) ${f}ms`, `   ✓ m${f} parses alpha`, `   ✓ m${f} parses beta`, `   ✓ m${f} rejects gamma`,
      `   ✓ m${f} keeps delta`, `   ✓ m${f} drops epsilon`, '')
  }
  const failure = [' FAIL  src/parser.test.ts > parser > nested', 'AssertionError: expected [ 1 ] to deeply equal [ 1, 2 ]',
    '    at parse (src/parser.ts:88:11)']
  lines.push(...failure, '', ' Test Files  1 failed | 40 passed (41)', '      Tests  1 failed | 200 passed (201)', 'done')
  const text = lines.join('\n')
  noteGoal('fix the failing parser test')
  const fake = io({ mode: 'on', minLines: 50 }, chunk => (chunk.includes('✓') ? 0.05 : 0.9))
  const out = await trim(fake, { command: 'npx vitest run', subagent: false }, bash(text)) as { stdout: string }
  expect(fake.asked.length).toBeGreaterThan(0)
  expect(fake.asked[0]!.state.goal).toBe('fix the failing parser test')
  expect(fake.asked[0]!.state.command).toBe('npx vitest run')
  // nothing protected was ever sent
  for (const body of fake.asked) for (const t of Object.values(body.state.chunks as Record<string, string>)) expect(t).not.toContain('AssertionError')
  for (const line of failure) expect(out.stdout).toContain(line)
  expect(out.stdout).toContain('Tests  1 failed | 200 passed (201)')
  expect(out.stdout).toMatch(/\[jev-mod: \d+ lines omitted — full output: \/home\/u\/\.cache\/jev-mod\/outputs\/1\.txt lines \d+–\d+\]/)
  expect(out.stdout.length).toBeLessThan(text.length / 2)
})

test('a subagent, or a backend that fails, gets the folding alone', async () => {
  const sub = io({ mode: 'on', minLines: 50 }, () => 0)
  const text = Array.from({ length: 300 }, (_, i) => `row ${i} ${['alpha', 'beta', 'gamma'][i % 3]}`).join('\n')
  expect(await trim(sub, { command: 'x', subagent: true }, bash(text))).toBe(null) // nothing to fold, nothing asked
  expect(sub.asked.length).toBe(0)
  const down = io({ mode: 'on', minLines: 50 }) // no backend: every request fails, the output stays as it came
  expect(await trim(down, { command: 'x', subagent: false }, bash(text))).toBe(null)
})
