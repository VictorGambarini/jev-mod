import { test, expect } from 'claude-code/testing'
import type { Answer } from '../../engine/client'
import {
  attribute, capRules, decide, diffArgs, followUpOf, hunkCap, MAX_FOLLOW_UP, MAX_RULES, parseDiff, projectPath,
  questionsOf, reading, render, rulesIn, statsOf, summarize, trimHunk, untrackedDiff, validRef, type FileDiff,
} from './triage'

// review-triage's pure rules: the git command, the diff split, what is sent, the questions,
// the verdict, which files drove it, and the answer's text.

const TOKEN = `ghp_${'Ab3d'.repeat(9)}`
const DIFF = [
  'diff --git a/src/auth/login.ts b/src/auth/login.ts',
  'index 1111111..2222222 100644',
  '--- a/src/auth/login.ts',
  '+++ b/src/auth/login.ts',
  '@@ -10,6 +10,7 @@ export function login() {',
  '   const user = find(name)',
  '-  if (!user) return false',
  '+  if (!user || !user.active) return false',
  '+  audit(user)',
  '   return check(user, password)',
  '@@ -40,3 +41,3 @@ function check() {',
  '-  return a == b',
  '+  return a === b',
  '   }',
  'diff --git a/old/name.ts b/new/name.ts',
  'similarity index 90%',
  'rename from old/name.ts',
  'rename to new/name.ts',
  'index 3333333..4444444 100644',
  '--- a/old/name.ts',
  '+++ b/new/name.ts',
  '@@ -1 +1 @@',
  '-export const x = 1',
  '+export const x = 2',
  'diff --git a/logo.png b/logo.png',
  'new file mode 100644',
  'index 0000000..5555555',
  'Binary files /dev/null and b/logo.png differ',
  'diff --git a/gone.txt b/gone.txt',
  'deleted file mode 100644',
  'index 6666666..0000000',
  '--- a/gone.txt',
  '+++ /dev/null',
  '@@ -1,2 +0,0 @@',
  '-one',
  '-two',
  '',
].join('\n')

const noul = (p: number): Answer => ({ type: 'noul', noul: p })
const noRedact = (text: string) => text
const never = () => false

test('the git command: uncommitted vs HEAD, the last commit, from where a branch left base, a range; paths after --', () => {
  const flags = ['--no-color', '--no-ext-diff', '--find-renames', '-U3']
  expect(diffArgs('/p', { kind: 'uncommitted' }, [])).toEqual(['git', '-C', '/p', 'diff', ...flags, 'HEAD', '--'])
  expect(diffArgs('/p', { kind: 'last-commit' }, ['src'])).toEqual(['git', '-C', '/p', 'diff', ...flags, 'HEAD~1', 'HEAD', '--', 'src'])
  expect(diffArgs('/p', { kind: 'base', base: 'main', mergeBase: true }, [])).toEqual(['git', '-C', '/p', 'diff', ...flags, '--merge-base', 'main', '--'])
  expect(diffArgs('/p', { kind: 'base', base: 'main', mergeBase: false }, [])).toEqual(['git', '-C', '/p', 'diff', ...flags, 'main', '--'])
  expect(diffArgs('/p', { kind: 'base', base: 'v1..v2', mergeBase: true }, ['a.ts'])).toEqual(['git', '-C', '/p', 'diff', ...flags, 'v1..v2', '--', 'a.ts'])
})

test('a base is a ref, never an option; paths stay inside the project', () => {
  for (const ok of ['main', 'origin/main', 'HEAD~3', 'abc123', 'v1.2..v1.3', 'HEAD@{1}', 'a...b']) expect(validRef(ok)).toBe(true)
  for (const bad of ['', '--output=/tmp/x', '-p', 'main; rm -rf /', 'a b', 'x'.repeat(201)]) expect(validRef(bad)).toBe(false)
  expect(projectPath('/proj', 'src/a.ts')).toBe('src/a.ts')
  expect(projectPath('/proj', '/proj/src/./a.ts')).toBe('src/a.ts')
  expect(projectPath('/proj', '/proj')).toBe('.')
  expect(projectPath('/proj', '../x')).toBe(null)
  expect(projectPath('/proj', '/etc/passwd')).toBe(null)
  expect(projectPath('/proj', '/project/x')).toBe(null)
  expect(projectPath('/proj', '-rf')).toBe('./-rf')
})

test('the diff splits per file and hunk, with renames, binaries and deletions, each counted', () => {
  const files = parseDiff(DIFF)
  expect(files.map(f => [f.path, f.status, f.added, f.removed, f.hunks.length])).toEqual([
    ['src/auth/login.ts', 'modified', 3, 2, 2],
    ['new/name.ts', 'renamed', 1, 1, 1],
    ['logo.png', 'binary', 0, 0, 0],
    ['gone.txt', 'deleted', 0, 2, 1],
  ])
  expect(files[1]!.oldPath).toBe('old/name.ts')
  expect(files[0]!.hunks[0]!.text.split('\n')[0]).toBe('@@ -10,6 +10,7 @@ export function login() {')
  expect(files[0]!.hunks[0]!.newStart).toBe(10)
  expect(files[0]!.hunks[1]!.text.endsWith('   }')).toBe(true)
  expect(statsOf(files)).toEqual({ files: 4, added: 4, removed: 5, chars: files.reduce((s, f) => s + f.hunks.reduce((t, h) => t + h.text.length, 0), 0) })
  expect(parseDiff('')).toEqual([])
})

test('an untracked file is a diff that adds it whole; a binary one has no hunks', () => {
  const added = untrackedDiff('new.ts', 'a\nb\n')
  expect([added.status, added.added, added.hunks[0]!.text]).toEqual(['added', 2, '@@ -0,0 +1,2 @@\n+a\n+b'])
  expect(untrackedDiff('x.bin', 'a\0b').status).toBe('binary')
  expect(untrackedDiff('big', null).hunks).toEqual([])
})

test('the seven questions: yes/no, each saying what a yes and a no mean; rules only when the project wrote some', () => {
  const all = questionsOf(true, true)
  expect(Object.keys(all)).toEqual(['security', 'data', 'interface', 'runtime', 'rules', 'tests', 'scope'])
  for (const q of Object.values(all)) {
    expect(q.type).toBe('noul')
    expect(Object.keys(q.criteria as object)).toEqual(['true', 'false'])
    expect(String(q.instructions)).toContain('the change in diff')
  }
  expect(String(all.scope!.instructions)).toContain('intent')
  expect(String(all.rules!.instructions)).toContain('project_rules')
  const bare = questionsOf(false, false)
  expect(Object.keys(bare)).toEqual(['security', 'data', 'interface', 'runtime', 'tests', 'scope'])
  expect(String(bare.scope!.instructions)).toContain('unfinished or inconsistent')
})

test('the verdict: quick only when every answer is a confident no; a yes or an unsure makes it full', () => {
  expect(reading(0.9, 0.8)).toBe('yes')
  expect(reading(0.1, 0.8)).toBe('no')
  expect(reading(0.21, 0.8)).toBe('unsure')
  expect(reading(0.5, 0.5)).toBe('yes')
  const ids = ['security', 'data', 'tests']
  expect(decide({ security: noul(0.05), data: noul(0.1), tests: noul(0.2) }, ids, 0.8)).toEqual({ verdict: 'quick', flags: [] })
  const yes = decide({ security: noul(0.95), data: noul(0.1), tests: noul(0.05) }, ids, 0.8)
  expect(yes).toEqual({ verdict: 'full', flags: [{ id: 'security', reading: 'yes', p: 0.95 }] })
  const unsure = decide({ security: noul(0.05), data: noul(0.4), tests: noul(0.05) }, ids, 0.8)
  expect(unsure).toEqual({ verdict: 'full', flags: [{ id: 'data', reading: 'unsure', p: 0.4 }] })
  // a stricter confidence turns a no it would have taken into unsure
  expect(decide({ security: noul(0.15), data: noul(0.1), tests: noul(0.05) }, ids, 0.9).verdict).toBe('full')
  // a missing or mistyped answer is unsure; yes comes before unsure
  const mixed = decide({ security: noul(0.4), tests: noul(0.99), data: { type: 'choice', choice: 'a', probabilities: {}, confidence: 1 } }, ids, 0.8)
  expect(mixed.flags.map(f => [f.id, f.reading])).toEqual([['tests', 'yes'], ['data', 'unsure'], ['security', 'unsure']])
})

test('the follow-up asks each flagged question of the largest files, capped; the answers name the files', () => {
  const files = parseDiff(DIFF)
  const { sent } = summarize(files, 12000, never, noRedact)
  const asked = followUpOf(['security', 'tests'], sent, false)
  // the binary file is asked about too (its status says what changed); the deleted file has hunks
  expect(Object.keys(asked).sort()).toEqual(['security__F1', 'security__F2', 'security__F3', 'security__F4', 'tests__F1', 'tests__F2', 'tests__F3', 'tests__F4'])
  expect(String(asked.security__F1!.instructions)).toContain('file F1 (src/auth/login.ts)')
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `F${i + 1}`, file: { ...files[0]!, path: `f${i}.ts` }, text: 'x' }))
  expect(Object.keys(followUpOf(['security', 'data', 'interface'], many, true)).length).toBeLessThanOrEqual(MAX_FOLLOW_UP)
  expect(followUpOf([], sent, true)).toEqual({})

  const flags = [{ id: 'security' as const, reading: 'yes' as const, p: 0.9 }, { id: 'tests' as const, reading: 'unsure' as const, p: 0.5 }]
  const by = attribute({ security__F1: noul(0.9), security__F2: noul(0.1), tests__F1: noul(0.3), tests__F2: noul(0.4) }, flags, sent)
  expect(by.get('security')!.map(f => f.path)).toEqual(['src/auth/login.ts'])
  expect(by.get('tests')!.map(f => f.path)).toEqual(['new/name.ts']) // none at 0.5: the likeliest
  expect(attribute({ security__F1: noul(0.1) }, flags.slice(0, 1), sent).has('security')).toBe(false)
})

test('caps: a diff under maxDiffChars goes whole; a larger one is cut evenly; past the room the rest is left out', () => {
  const files = parseDiff(DIFF)
  const whole = summarize(files, 12000, never, noRedact)
  expect([whole.trimmed, whole.omitted]).toEqual([0, 0])
  expect(whole.sent[0]!.text).toBe(files[0]!.hunks.map(h => h.text).join('\n'))
  expect(whole.sent[2]!.text).toBe('(binary file)')

  const long = (n: number, tag: string): FileDiff => ({ path: `${tag}.ts`, status: 'modified', added: n, removed: 0,
    hunks: [{ header: '@@ -1 +1,1 @@', newStart: 1, newLines: n, added: n, removed: 0,
      text: ['@@ -1 +1,1 @@', ...Array.from({ length: n }, (_, i) => `+line ${tag} ${i} ${'x'.repeat(30)}`)].join('\n') }] })
  const big = [long(200, 'a'), long(200, 'b'), long(5, 'c')]
  const cut = summarize(big, 4000, never, noRedact)
  const total = cut.sent.reduce((s, x) => s + x.text.length, 0)
  expect(total).toBeLessThanOrEqual(4000 + 200) // each cut carries a short "more lines" note
  expect(cut.trimmed).toBe(2)
  expect(cut.sent[2]!.text).not.toContain('more lines') // the short hunk is whole
  expect(cut.sent[0]!.text).toContain('more lines not sent')

  const tiny = summarize(Array.from({ length: 40 }, (_, i) => long(50, `f${i}`)), 2000, never, noRedact)
  expect(tiny.omitted).toBeGreaterThan(0)
  expect(tiny.sent.reduce((s, x) => s + x.text.length, 0)).toBeLessThanOrEqual(2000)

  expect(hunkCap([10, 20], 100)).toBe(Infinity)
  expect(hunkCap([100, 100, 10], 110)).toBe(50)
  expect(trimHunk('a\nb\nc\nd', 4)).toBe('a\nb\n… (2 more lines not sent)')
})

test('a hunk that looks like it holds a secret is not sent; a path that does withholds the whole file', () => {
  const secret = DIFF.replace('+  audit(user)', `+  const token = "${TOKEN}"`)
  const files = parseDiff(secret)
  const s = summarize(files, 12000, text => text.includes('ghp_'), noRedact)
  expect(s.withheld).toEqual([{ path: 'src/auth/login.ts', lines: 'lines 10-16' }])
  expect(s.sent.map(x => x.text).join('\n')).not.toContain('ghp_')
  expect(s.sent[0]!.text).toContain('a === b') // the other hunk of the same file still goes
  expect(s.sendableShare).toBeGreaterThan(0.5)
  const byPath = summarize(files, 12000, text => text.includes('gone.txt'), noRedact)
  expect(byPath.withheld).toEqual([{ path: 'gone.txt', lines: 'the whole file' }])
  expect(byPath.sent.map(x => x.file.path)).not.toContain('gone.txt')
  const all = summarize(files, 12000, () => true, noRedact)
  expect(all.sendableShare).toBe(0)
})

test('the project rules: list items and lines with a rule\'s words, not headings, tables or code; capped', () => {
  const text = '# Rules\n\nSome intro text here.\n- Never commit to main directly\n* run the tests\n1. Keep diffs small please\n'
    + '| a | b |\n```\n- not a rule in a fence\n```\nYou must sign commits.\n- ok\n'
  expect(rulesIn(text)).toEqual(['Never commit to main directly', 'run the tests', 'Keep diffs small please', 'You must sign commits.'])
  const many = capRules(Array.from({ length: 100 }, (_, i) => `- rule number ${i} must hold`))
  expect(many.length).toBe(MAX_RULES)
  expect(capRules(['a rule we prefer', 'a rule we prefer', 'plain item'])).toEqual(['a rule we prefer', 'plain item'])
})

test('the answer: verdict and what to do first, then why, which files, and the diff\'s size', () => {
  const files = parseDiff(DIFF)
  const stats = statsOf(files)
  const quick = render({ verdict: 'quick', source: 'uncommitted changes vs HEAD', stats, files, by: 'the decision model (1 request)', minConfidence: 0.8,
    skipped: ['project rules (none)'] })
  const q = quick.split('\n')
  expect(q[0]).toBe('verdict: quick')
  expect(q[1]).toBe('one review pass is enough.')
  expect(quick).toContain('all 6 questions answered no with confidence >= 0.8')
  expect(quick).toContain('diff: 4 files, +4 -5 (uncommitted changes vs HEAD)')
  expect(quick).not.toContain('look first')
  expect(quick).toContain('never replaces the review')

  const full = render({ verdict: 'full', source: 'changes since main', stats, files, by: 'the decision model (2 requests)',
    flags: [{ id: 'security', reading: 'yes', p: 0.93 }, { id: 'tests', reading: 'unsure', p: 0.55 }],
    attributed: new Map([['security', [files[0]!]]]), withheld: [{ path: 'gone.txt', lines: 'lines 1-2' }] })
  const f = full.split('\n')
  expect(f[0]).toBe('verdict: full')
  expect(f[1]).toBe('do the full review; start with these files.')
  expect(full).toContain('- security-sensitive code (auth, permissions, secrets) (yes, p=0.93): src/auth/login.ts (lines 10-16, lines 41-43)')
  expect(full).toContain('- behaviour changed without a test that covers it (unsure, p=0.55)\n')
  expect(full).toContain('not sent, looks like it holds or handles a secret (check it yourself): gone.txt (lines 1-2)')
  expect(full).toContain('look first: src/auth/login.ts, gone.txt, new/name.ts, logo.png')
})
