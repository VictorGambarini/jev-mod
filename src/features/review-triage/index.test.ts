import { test, expect } from 'claude-code/testing'
import type { FetchInit, IO } from '../../core/io'
import { run } from '../command'
import { triage } from './index'

// review-triage's glue with a fake IO: git's answers by command, a project with a CLAUDE.md,
// and a fake decision backend that answers each question from a table. No real key, no real
// config: the user file lives at a made-up home.

const USER = '/home/u/.config/jev-mod/config.json'
const ROOT = '/proj'
const TOKEN = `ghp_${'Ab3d'.repeat(9)}`

const DIFF = [
  'diff --git a/src/auth/login.ts b/src/auth/login.ts',
  'index 1111111..2222222 100644',
  '--- a/src/auth/login.ts',
  '+++ b/src/auth/login.ts',
  '@@ -10,3 +10,4 @@ export function login() {',
  '   const user = find(name)',
  '-  if (!user) return false',
  '+  if (!user || !user.active) return false',
  '+  audit(user)',
  'diff --git a/README.md b/README.md',
  'index 3333333..4444444 100644',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1,2 +1,2 @@',
  ' # Title',
  '-old words',
  '+new words',
  '',
].join('\n')

type Fake = IO & { disk: Record<string, string>; store: Record<string, unknown>; asked: { state: any; questions: Record<string, any> }[]; ran: string[][] }

type Opts = {
  settings?: Record<string, unknown>
  backend?: 'table' | 'down' | 'none'
  /** p(yes) per question id; a follow-up `<id>__F<n>` reads `<id>__<path>` first. Default: every one 0.05. */
  p?: Record<string, number>
  /** git diff's stdout by which diff it is; `fail` makes that one exit 128. */
  git?: { uncommitted?: string; untracked?: string[]; lastCommit?: string; firstCommit?: string; base?: string; mergeBaseFails?: boolean; notRepo?: boolean }
  options?: Record<string, unknown>
  rules?: string | null
}

function io(opts: Opts = {}): Fake {
  const files: Record<string, string> = { [USER]: JSON.stringify({ features: { 'review-triage': opts.settings ?? { mode: 'on' } } }) }
  if (opts.rules !== null) files[`${ROOT}/CLAUDE.md`] = opts.rules ?? '# Rules\n- Never call the network in tests\n- Every change needs a test\n- Never log a password\n'
  const g = opts.git ?? { uncommitted: DIFF }
  for (const name of g.untracked ?? []) files[`${ROOT}/${name}`] = `content of ${name}\nsecond line\n`
  const store: Record<string, unknown> = {}
  const asked: Fake['asked'] = []
  const ran: string[][] = []
  const backend = opts.backend ?? 'table'
  const env: Record<string, string> = { JEV_HOME: '/jev', JEV_LIMITS: 'off', ...(backend !== 'none' ? { TYPESAFE_API_KEY: 'test-not-a-key' } : {}) }
  const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '' })
  return {
    disk: files, store, asked, ran,
    option: (name: string) => opts.options?.[name] as string | boolean | undefined,
    readFile: async (path: string) => { if (path in files) return files[path]; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    folders: async () => [], files: async () => [],
    env: async (name: string) => env[name],
    home: async () => '/home/u',
    projectRoot: async () => ROOT,
    run: async (argv: string[]) => {
      ran.push(argv)
      if (argv[0] !== 'git') return { exitCode: 1, stdout: '', stderr: '' }
      if (g.notRepo) return { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' }
      if (argv[3] === 'ls-files') return ok((g.untracked ?? []).map(n => `${n}\0`).join(''))
      const rest = argv.slice(argv.indexOf('-U3') + 1, argv.indexOf('--'))
      if (rest[0] === 'HEAD' && rest.length === 1) return ok(g.uncommitted ?? '')
      if (rest[0] === 'HEAD~1' && g.firstCommit !== undefined) return { exitCode: 128, stdout: '', stderr: "fatal: ambiguous argument 'HEAD~1': unknown revision" }
      if (rest[0] === '4b825dc642cb6eb9a060e54bf8d69288fbee4904') return ok(g.firstCommit ?? '')
      if (rest[0] === 'HEAD~1') return ok(g.lastCommit ?? '')
      if (rest[0] === '--merge-base' && g.mergeBaseFails) return { exitCode: 129, stdout: '', stderr: 'error: unknown option merge-base' }
      return ok(g.base ?? '')
    },
    sleep: () => new Promise<void>(() => {}),
    sessionId: async () => 's1',
    storeGet: async (key: string) => store[key],
    storeSet: async (key: string, value: unknown) => { store[key] = value },
    status: () => {}, toast: () => {},
    fetch: async (_url: string, init?: FetchInit) => {
      if (backend !== 'table') return { status: 503, ok: false, text: '' }
      const body = JSON.parse(init!.body!)
      asked.push(body)
      const answers = Object.fromEntries(Object.keys(body.questions).map(q => {
        const [id, file] = q.split('__')
        const path = file ? body.state.files.find((f: any) => f.id === file)?.path : undefined
        const p = (path !== undefined ? opts.p?.[`${id}__${path}`] : undefined) ?? opts.p?.[q] ?? (file ? 0.1 : 0.05)
        return [q, { type: 'noul', noul: p }]
      }))
      return { status: 200, ok: true, text: JSON.stringify({ answers, model: 'jev-test', usage: { input_tokens: 2000 } }) }
    },
  } as unknown as Fake
}

const today = (fake: Fake) => Object.values(fake.store.activity as Record<string, any>)[0]['review-triage']
const settle = () => new Promise(r => setTimeout(r, 10))
const diffs = (fake: Fake) => fake.ran.filter(a => a[3] === 'diff').map(a => a.slice(a.indexOf('-U3') + 1))

test('the change: uncommitted vs HEAD with untracked files; none, then the last commit; a base; paths after --', async () => {
  const plain = io({ git: { uncommitted: DIFF, untracked: ['new.ts'] } })
  const out = await triage(plain, {})
  expect(diffs(plain)).toEqual([['HEAD', '--']])
  expect(plain.ran.some(a => a[3] === 'ls-files')).toBe(true)
  expect(out).toContain('diff: 3 files, +5 -2 (uncommitted changes vs HEAD)')
  expect(plain.asked[0]!.state.diff.F3).toContain('+content of new.ts')

  const empty = io({ git: { uncommitted: '', lastCommit: DIFF } })
  expect(await triage(empty, {})).toContain('(the last commit, HEAD~1..HEAD (no uncommitted changes))')
  expect(diffs(empty)).toEqual([['HEAD', '--'], ['HEAD~1', 'HEAD', '--']])

  const based = io({ git: { base: DIFF } })
  expect(await triage(based, { base: 'main', paths: ['src', `${ROOT}/README.md`] })).toContain('(changes since main)')
  expect(diffs(based)).toEqual([['--merge-base', 'main', '--', 'src', 'README.md']])

  const oldGit = io({ git: { base: DIFF, mergeBaseFails: true } })
  await triage(oldGit, { base: 'main' })
  expect(diffs(oldGit)).toEqual([['--merge-base', 'main', '--'], ['main', '--']])

  const range = io({ git: { base: DIFF } })
  await triage(range, { base: 'v1..v2' })
  expect(diffs(range)).toEqual([['v1..v2', '--']])
  expect(range.ran.some(a => a[3] === 'ls-files')).toBe(false) // a range has no working tree in it

  const nothing = io({ git: { uncommitted: '', lastCommit: '' } })
  expect(await triage(nothing, {})).toContain('found no changes to triage')
  expect(nothing.asked.length).toBe(0)
})

test('bad input is said plainly and nothing runs: an option as base, a path outside the project', async () => {
  const fake = io()
  expect(await triage(fake, { base: '--output=/tmp/x' })).toContain('base must be a git ref')
  expect(await triage(fake, { paths: ['../elsewhere'] })).toContain('inside the project')
  expect(fake.ran.length).toBe(0)
})

test('every answer a confident no: quick, in one request with the seven questions, the diff and the rules', async () => {
  const fake = io()
  const out = await triage(fake, { intent: 'deactivated users cannot log in' })
  const lines = out.split('\n')
  expect(lines[0]).toBe('verdict: quick')
  expect(lines[1]).toBe('one review pass is enough.')
  expect(out).toContain('all 7 questions answered no with confidence >= 0.8')
  expect(out).toContain('triaged by the decision model (1 request)')
  expect(fake.asked.length).toBe(1)
  const sent = fake.asked[0]!
  expect(Object.keys(sent.questions)).toEqual(['security', 'data', 'interface', 'runtime', 'rules', 'tests', 'scope'])
  expect(Object.values(sent.questions).every((q: any) => q.type === 'noul')).toBe(true)
  expect(sent.state.intent).toBe('deactivated users cannot log in')
  // a rule that names a secret is not sent
  expect(sent.state.project_rules).toEqual(['Never call the network in tests', 'Every change needs a test'])
  expect(sent.state.files.map((f: any) => f.path)).toEqual(['src/auth/login.ts', 'README.md'])
  expect(sent.state.diff.F1).toContain('+  audit(user)')
  await settle()
  expect(today(fake).quick).toBe(1)
  expect(today(fake).asked).toBe(1)
  expect(today(fake).cost).toBeGreaterThan(0)
})

test('a yes: full, the question named, and one follow-up names the file behind it', async () => {
  const fake = io({ p: { security: 0.95, 'security__src/auth/login.ts': 0.9, 'security__README.md': 0.05 } })
  const out = await triage(fake, {})
  const lines = out.split('\n')
  expect(lines[0]).toBe('verdict: full')
  expect(lines[1]).toBe('do the full review; start with these files.')
  expect(out).toContain('- security-sensitive code (auth, permissions, secrets) (yes, p=0.95): src/auth/login.ts (lines 10-13)')
  expect(out).toContain('look first: src/auth/login.ts, README.md')
  expect(out).toContain('triaged by the decision model (2 requests)')
  expect(fake.asked.length).toBe(2)
  expect(Object.keys(fake.asked[1]!.questions).sort()).toEqual(['security__F1', 'security__F2'])
  // no intent given: the scope question asks whether it looks unfinished instead
  expect(String(fake.asked[0]!.questions.scope.instructions)).toContain('unfinished or inconsistent')
  await settle()
  expect(today(fake).full).toBe(1)
  expect(today(fake).asked).toBe(2)
})

test('an unsure answer: full; one file changed needs no follow-up; no rules, no rules question', async () => {
  const one = DIFF.split('diff --git a/README.md')[0]!
  const fake = io({ p: { tests: 0.5 }, git: { uncommitted: one }, rules: null })
  const out = await triage(fake, {})
  expect(out.split('\n')[0]).toBe('verdict: full')
  expect(out).toContain('- behaviour changed without a test that covers it (unsure, p=0.50): src/auth/login.ts')
  expect(out).toContain("not asked: project rules (no rules found in the project's CLAUDE.md or AGENTS.md)")
  expect(fake.asked.length).toBe(1)
  expect(Object.keys(fake.asked[0]!.questions)).not.toContain('rules')
})

test('a hunk that looks like it holds a secret is never sent, and makes the verdict full', async () => {
  const secret = DIFF.replace('+  audit(user)', `+  const token = "${TOKEN}"`)
  const fake = io({ git: { uncommitted: secret + DIFF.split('\n').slice(9).join('\n').replace(/README/g, 'GUIDE') } })
  const out = await triage(fake, {})
  expect(JSON.stringify(fake.asked)).not.toContain('Ab3d')
  expect(out.split('\n')[0]).toBe('verdict: full')
  expect(out).toContain('not sent, looks like it holds or handles a secret (check it yourself): src/auth/login.ts (lines 10-13)')
  expect(out.split('look first: ')[1]!.startsWith('src/auth/login.ts')).toBe(true)

  // when what is left is too little, nothing is asked at all
  const mostly = io({ git: { uncommitted: secret.split('diff --git a/README.md')[0]! } })
  const out2 = await triage(mostly, {})
  expect(mostly.asked.length).toBe(0)
  expect(out2).toContain('triage could not decide: too little of the diff could be sent')
})

test('too large to triage: full, and nothing sent', async () => {
  const huge = ['diff --git a/big.ts b/big.ts', '--- a/big.ts', '+++ b/big.ts', '@@ -0,0 +1,5000 @@',
    ...Array.from({ length: 5000 }, (_, i) => `+const line${i} = ${i} // ${'pad '.repeat(8)}`)].join('\n')
  const fake = io({ git: { uncommitted: huge }, settings: { mode: 'on', maxDiffChars: 2000 } })
  const out = await triage(fake, {})
  expect(out.split('\n')[0]).toBe('verdict: full')
  expect(out).toContain('too large to triage')
  expect(out).toContain('look first: big.ts')
  expect(fake.asked.length).toBe(0)
  await settle()
  expect(today(fake)['too-large']).toBe(1)
})

test('a large diff under the hard cap is cut to maxDiffChars before it is sent', async () => {
  const big = ['diff --git a/big.ts b/big.ts', '--- a/big.ts', '+++ b/big.ts', '@@ -0,0 +1,400 @@',
    ...Array.from({ length: 400 }, (_, i) => `+const line${i} = ${i}`)].join('\n')
  const fake = io({ git: { uncommitted: big }, settings: { mode: 'on', maxDiffChars: 2000 } })
  const out = await triage(fake, {})
  expect(fake.asked[0]!.state.diff.F1.length).toBeLessThanOrEqual(2100)
  expect(fake.asked[0]!.state.diff_note).toContain('cut to fit')
  expect(out).toContain('trimmed to fit before it was sent')
})

test('fail open, always full with the reason: off, no key, private mode, not a repository', async () => {
  expect(await triage(io({ settings: { mode: 'off' } }), {})).toContain('review_triage is off')

  const nokey = io({ backend: 'none' })
  const out = await triage(nokey, {})
  expect(out.split('\n')[0]).toBe('verdict: full')
  expect(out).toContain('triage could not decide: no decision backend key')
  expect(out).toContain('look first: src/auth/login.ts, README.md')
  await settle()
  expect(today(nokey).undecided).toBe(1)

  const priv = io({ options: { private: true } })
  expect(await triage(priv, {})).toContain('triage could not decide: private mode')
  expect(priv.asked.length).toBe(0)

  const norepo = io({ git: { notRepo: true } })
  const out2 = await triage(norepo, {})
  expect(out2.split('\n')[0]).toBe('verdict: full')
  expect(out2).toContain('git could not read the uncommitted changes: fatal: not a git repository')
})

test('the registry entry is all /jev-mod needs: listed, helped, set', async () => {
  const fake = io({ backend: 'none' })
  delete fake.disk[USER]
  expect((await run(fake, 'list')).text).toContain('review-triage')
  expect((await run(fake, 'review-triage')).text).toContain('There is no shadow')
  expect((await run(fake, 'review-triage shadow')).text).toContain('mode must be off, on')
  expect((await run(fake, 'review-triage minConfidence 0.4')).text).toContain('0.5 to 1')
  expect((await run(fake, 'review-triage maxDiffChars 20000')).text).toContain('20000')
  expect(JSON.parse(fake.disk[USER]!).features['review-triage'].maxDiffChars).toBe(20000)
  expect(await triage(fake, {})).toContain('review_triage is off')
})

const manyFiles = (n: number, lines: number) => Array.from({ length: n }, (_, i) => [
  `diff --git a/src/m${i}.ts b/src/m${i}.ts`, '--- a/src/m' + i + '.ts', '+++ b/src/m' + i + '.ts', `@@ -0,0 +1,${lines} @@`,
  ...Array.from({ length: lines }, (_, j) => `+export const value${i}_${j} = ${j}`)].join('\n')).join('\n') + '\n'

test('hunks left out to fit make it full, even when every answer is a no', async () => {
  const fake = io({ git: { uncommitted: manyFiles(40, 12) }, settings: { mode: 'on', maxDiffChars: 2000 } })
  const out = await triage(fake, {})
  expect(fake.asked[0]!.state.diff_note).toContain('left out')
  expect(out).toContain('verdict: full')
  expect(out).toMatch(/- \d+ hunk\(s\) or file\(s\) not shown/)
})

test('the whole request fits the backend\'s limit: a long files list shrinks the diff, not the answer to "too large"', async () => {
  const fake = io({ git: { uncommitted: manyFiles(250, 20) }, settings: { mode: 'on', maxDiffChars: 40000 } })
  const out = await triage(fake, {})
  expect(fake.asked.length).toBeGreaterThan(0)
  expect(JSON.stringify(fake.asked[0]!.state).length).toBeLessThan(60000)
  expect(out).not.toContain('too large to send')
  expect(out).toContain('not shown')
})

test('an untracked text file over 1 MB is "too large, not shown" and makes it full, not a binary file', async () => {
  const fake = io({ git: { uncommitted: DIFF, untracked: ['huge.txt'] } })
  fake.disk[`${ROOT}/huge.txt`] = 'x'.repeat(1_000_001)
  const out = await triage(fake, {})
  expect(fake.asked[0]!.state.diff.F3).toBe('(too large, not shown)')
  expect(out).toContain('verdict: full')
  expect(out).toContain('not shown')
})

test('a repository with one commit: the last commit is diffed against the empty tree', async () => {
  const fake = io({ git: { uncommitted: '', firstCommit: DIFF } })
  const out = await triage(fake, {})
  expect(out).not.toContain('found no changes')
  expect(out).toContain('the first commit, against the empty tree')
  expect(diffs(fake).at(-1)).toEqual(['4b825dc642cb6eb9a060e54bf8d69288fbee4904', 'HEAD', '--'])
})

// Last: a failure starts the five-minute cool-off for the rest of this file's process.
test('a backend that fails: full with the reason; then the cool-off asks nothing', async () => {
  const down = await triage(io({ backend: 'down' }), {})
  expect(down.split('\n')[0]).toBe('verdict: full')
  expect(down).toContain('triage could not decide: the decision backend failed: http_503')
  const after = io()
  expect(await triage(after, {})).toContain('cooling off')
  expect(after.asked.length).toBe(0)
})
