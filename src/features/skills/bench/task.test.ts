import { test, expect } from 'claude-code/testing'
import { armsFor, guard, overlayFor, plan } from '../../../bench/plan'
import { checkTask, failedRequests, makeTask, section, skillsLoaded, TASKS, transcriptDir, type Work } from './task-checks'

// The plugin's tests cannot read files: the project is a map of path to text. task.check.ts runs the
// same checks against the real fixture on disk.
function vfs(files: Record<string, string>, original: Record<string, string> = files): Work {
  const under = (m: Record<string, string>, dir: string) => [...new Set(Object.keys(m).filter(p => p.startsWith(`${dir}/`)).map(p => p.slice(dir.length + 1).split('/')[0]!))]
  return { dir: '/x', read: async p => files[p] ?? '', list: async d => under(files, d), exec: async () => ({ code: 0, out: '' }),
    original: async p => original[p] ?? '', originalList: async d => under(original, d) }
}

const task = makeTask({ work: () => vfs({}), loaded: async () => null })

test('ten cases: eight need a skill, two need none; every id and prompt is its own', () => {
  expect(TASKS.length).toBe(10)
  expect(new Set(TASKS.map(t => t.id)).size).toBe(10)
  expect(new Set(TASKS.map(t => t.prompt)).size).toBe(10)
  expect(TASKS.filter(t => t.skill === null).length).toBe(2)
  expect(new Set(TASKS.filter(t => t.skill).map(t => t.skill)).size).toBe(8)
})

test('the changelog case: an entry under Changed, or one more released section edited, fails; one in Operator notes passes', async () => {
  const base = '# Changelog\n\n## [Unreleased]\n\n### Changed\n\n### Operator notes\n\n## [1.8.0] - 2026-09-24\n\n### Fixed\n* **orders** — x (#1)\n'
  const t = TASKS.find(t => t.id === 'changelog-default')!
  const entry = '* **webhooks** — the default retry limit is 5 (was 3) (#482)\n'
  const wrong = await checkTask(t, '', vfs({ 'CHANGELOG.md': base.replace('### Changed\n', `### Changed\n${entry}`) }, { 'CHANGELOG.md': base }))
  expect(wrong.success).toBe(false)
  expect(wrong.detail?.failed).toContain('entry is in Operator notes')
  const right = await checkTask(t, '', vfs({ 'CHANGELOG.md': base.replace('### Operator notes\n', `### Operator notes\n${entry}`) }, { 'CHANGELOG.md': base }))
  expect([right.success, right.score]).toEqual([true, 1])
  const edited = await checkTask(t, '', vfs({ 'CHANGELOG.md': base.replace('### Operator notes\n', `### Operator notes\n${entry}`).replace('x (#1)', 'y (#1)') }, { 'CHANGELOG.md': base }))
  expect(edited.detail?.failed).toEqual(['released sections untouched'])
})

test('the ADR case wants 0010 (the reserved 0008 and 0009 skipped), the sections in order, the index row', async () => {
  const t = TASKS.find(t => t.id === 'adr-queue')!
  const orig = { 'docs/adr/0007-x.md': 'x', 'docs/adr/README.md': '| 0007 | x | Accepted |\n' }
  const adr = (n: string) => `# ADR-${n}: Move to SQS\n\n- Status: Proposed\n- Deciders: platform\n\n## Context\nx\n## Decision\nx\n## Consequences\nx\n## Alternatives considered\nx\n`
  const by = (n: string) => vfs({ ...orig, [`docs/adr/${n}-sqs.md`]: adr(n), 'docs/adr/README.md': orig['docs/adr/README.md'] + `| ${n} | Move to SQS | Proposed |\n` }, orig)
  expect((await checkTask(t, '', by('0010'))).success).toBe(true)
  expect((await checkTask(t, '', by('0008'))).detail?.failed).toContain('file is numbered 0010')
})

test('the log case counts requests by their last attempt on the NZ day, not lines, and ignores /healthz', async () => {
  const line = (t: string, rid: string, path: string, status: number, attempt: number) => `${t} level=x rid=${rid} method=GET path=${path} status=${status} attempt=${attempt} ms=1`
  const logs = [
    [line('2026-10-07T10:59:59Z', 'a', '/v1/orders', 500, 1), // before the NZ day starts
      line('2026-10-07T11:00:00Z', 'b', '/v1/orders', 500, 1), line('2026-10-07T11:00:02Z', 'b', '/v1/orders', 200, 2), // recovered on retry
      line('2026-10-07T12:00:00Z', 'c', '/v1/orders/7', 502, 1), line('2026-10-07T12:00:02Z', 'c', '/v1/orders/7', 503, 2), // failed, two lines
      line('2026-10-07T13:00:00Z', 'd', '/healthz', 503, 1), line('2026-10-07T13:00:00Z', 'e', '/v1/cart', 500, 1)].join('\n'),
    [line('2026-10-08T10:59:59Z', 'f', '/v1/orders', 500, 1), line('2026-10-08T11:00:00Z', 'g', '/v1/orders', 500, 1)].join('\n'),
  ]
  expect(failedRequests(logs, '2026-10-08', '/v1/orders')).toBe(2)
  const t = TASKS.find(t => t.id === 'logs-failed-orders')!
  const w = vfs({ 'logs/app-2026-10-07.log': logs[0]!, 'logs/app-2026-10-08.log': logs[1]! })
  expect((await checkTask(t, 'There were 2 failed order requests.', w)).success).toBe(true)
  expect((await checkTask(t, 'There were 3 failed order requests.', w)).success).toBe(false)
  expect((await checkTask(t, 'About 12 of them', w)).success).toBe(false)
})

test('the incident case wants UTC times, SEV2 and no names outside the action table', async () => {
  const t = TASKS.find(t => t.id === 'incident-payments')!
  const doc = (time: string, who: string) => ['# Incident: x', '**Severity:** SEV2', '', '## Summary', `${who} saw it`, '## Impact', 'x', '## Timeline (UTC)',
    ...['01:51', '01:58', '02:05', '02:20', '02:34'].map(h => `- ${h}Z — e`), `- ${time} — e`, '## Root cause', 'x', '## Detection', 'x', '## Action items',
    '| Action | Owner | Due |', '|---|---|---|', '| a | Hana | 2026-10-17 |', '| b | Aroha | 2026-10-24 |', '| c | Tom | 2026-10-31 |'].join('\n')
  const at = (text: string) => vfs({ 'docs/incidents/2026-10-08-x.md': text })
  expect((await checkTask(t, '', at(doc('02:38Z', 'support')))).success).toBe(true)
  expect((await checkTask(t, '', at(doc('3:38pm', 'support')))).success).toBe(false)
  expect((await checkTask(t, '', at(doc('02:38Z', 'Hana')))).detail?.failed).toEqual(['blameless prose'])
})

test('sections are cut at the next heading of the same or a higher level', () => {
  const text = '# A\n## [Unreleased]\n### Added\nx\n### Operator notes\ny\n## [1.0]\nz\n'
  expect(section(text, /^## \[Unreleased\]/)).toBe('### Added\nx\n### Operator notes\ny')
  expect(section(section(text, /^## \[Unreleased\]/), /^### Operator notes/)).toBe('y')
})

test('the skills a session loaded are read from its transcript; a text mention is not a call', () => {
  const call = (skill: string) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', name: 'Skill', input: { skill } }] } })
  const other = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '"Skill"' } }] } })
  expect(skillsLoaded([call('adr-new'), other, 'not json "Skill"', call('design-doc')].join('\n'))).toEqual(['adr-new', 'design-doc'])
  expect(skillsLoaded('')).toEqual([])
  expect(transcriptDir('/tmp/jev-mod-bench-x1/adr-queue/project-1')).toBe('-tmp-jev-mod-bench-x1-adr-queue-project-1')
})

test('the row records which skill loaded, and whether it was the right one (none, when none fits)', async () => {
  const loaded = (names: string[] | null) => makeTask({ work: () => vfs({}), loaded: async () => names })
  const cases = loaded(null).cases()
  const adr = cases.find(c => c.id === 'adr-queue')!
  const paginate = cases.find(c => c.id === 'bug-paginate')!
  expect((await loaded(['adr-new']).check(adr, '', '/x')).detail).toMatchObject({ skills_loaded: ['adr-new'], skill_ok: true, expected_skill: 'adr-new' })
  expect((await loaded(['design-doc']).check(adr, '', '/x')).detail).toMatchObject({ skill_ok: false })
  expect((await loaded([]).check(paginate, '', '/x')).detail).toMatchObject({ skill_ok: true })
  expect((await loaded(['code-review']).check(paginate, '', '/x')).detail).toMatchObject({ skill_ok: false })
  expect((await loaded(null).check(adr, '', '/x')).detail).toMatchObject({ skills_loaded: null, skill_ok: null })
})

test('the plan: both arms for ten cases, one prompt each in its own folder, no setup, skills on only in the jev-mod arm', () => {
  const cases = task.cases()
  expect(cases.every(c => c.isolate === true && c.git === true && c.setup.length === 0)).toBe(true)
  const arms = armsFor(task, ['openrouter'], null, {})
  expect(arms.map(a => a.kind)).toEqual(['claude', 'jev-mod'])
  const p = plan(task, cases, arms)
  expect([p.cases, p.arms, p.claudeCalls, p.setupCalls]).toEqual([10, 2, 20, 0])
  expect(p.decisionCalls).toBe(10 * task.decisionCallsPerArm)
  expect(guard(p, false)).toContain('Nothing was run')
  const mode = (arm: (typeof arms)[number]) => (overlayFor(task, arm, '/tmp/l') as { features: Record<string, { mode: string }> }).features.skills!.mode
  expect([mode(arms[0]!), mode(arms[1]!)]).toEqual(['off', 'on'])
  const none = { ledgerEntries: 0, contextTokens: null, compaction: null }
  expect(task.verify!(cases[0]!, arms[1]!, none, new Map())).toBe('skills_not_run')
  expect(task.verify!(cases[0]!, arms[0]!, none, new Map())).toBe(null)
  expect(task.verify!(cases[0]!, arms[1]!, { ...none, ledgerEntries: 2 }, new Map())).toBe(null)
})
