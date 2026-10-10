import { test, expect } from 'claude-code/testing'
import type { Answer } from '../../engine/client'
import { checkQuestions } from '../../engine/client'
import {
  actedAfter, answersOf, claims, claimsCompletion, decide, decideShort, evidence, isConsequential, shortAnswersOf, shortQuestions, shortStateOf,
  stopShortNote, unfinishedStep, unverifiedNote, isRequest, keepIds, mayNudge, nudge, nudged, questionsOf, requestIndex,
  stateOf, TAG, type Message,
} from './gate'
import { redact } from '../../engine/privacy'

const user = (text: string): Message => ({ role: 'user', text })
const said = (text: string, ...toolUses: Message['toolUses'] & object[]): Message => ({ role: 'assistant', text, toolUses })
const bash = (command: string, text: string, isError?: true) => ({ tool: 'Bash', input: { command }, text, ...(isError ? { isError } : {}) })
const edit = (file_path: string) => ({ tool: 'Edit', input: { file_path }, text: 'ok' })

test('completion and success claims are found; progress, plans and hedged finishes are not', () => {
  for (const text of ['Done.', 'All tests pass.', 'I fixed the failing test and the build is green.', '✅ lint', 'The feature is implemented.'])
    expect(claimsCompletion(text)).toBe(true)
  for (const text of ['I will now run the tests.', 'Which file should I edit?', 'This is not yet done.',
    "I couldn't run the tests here.", 'Here is the plan:\n1. read\n2. edit'])
    expect(claimsCompletion(text)).toBe(false)
})

test('claims are cut sentence by sentence, without code, markup or repeats, and capped', () => {
  const text = 'I read the file. Fixed the parser.\n\n- **All 12 tests pass**\n```\nok done\n```\nFixed the parser.'
  expect(claims(text)).toEqual(['Fixed the parser.', 'All 12 tests pass'])
  expect(claims(Array.from({ length: 20 }, (_, i) => `Step ${i} done.`).join(' ')).length).toBe(8)
  expect([...claims(`Done ${'x'.repeat(500)}`)[0]!].length).toBe(200)
})

test("the request is the person's latest message, never a tool result, a hook's text or the gate's own note", () => {
  expect(isRequest(user('fix the bug'))).toBe(true)
  expect(isRequest(user(''))).toBe(false)
  expect(isRequest(user(`${TAG} verify it`))).toBe(false)
  expect(isRequest(user('Stop hook feedback: something'))).toBe(false)
  expect(isRequest(user('<system-reminder>x</system-reminder>'))).toBe(false)
  expect(requestIndex([user('old'), said('ok'), user('new'), said('', bash('ls', 'a')), user('')])).toBe(2)
})

test('evidence starts at the request: edited files once each, checks with their output, the rest counted', () => {
  const messages = [
    user('earlier'), said('', edit('/old.ts')),
    user('fix the parser and run the tests'),
    said('', { tool: 'Read', input: {}, text: 'x' }, edit('/src/a.ts'), edit('/src/b.ts'), edit('/src/a.ts')),
    user(''),
    said('', bash('npm test', 'ran 12 tests\n12 passed'), bash('ls', 'a b')),
  ]
  const ev = evidence(messages, 6000)
  expect(ev.edited_files).toEqual(['/src/b.ts', '/src/a.ts'])
  expect(ev.other_tools).toEqual({ Read: 1 })
  expect(ev.commands.map(c => [c.command, c.check, c.failed])).toEqual([['npm test', true, false], ['ls', false, false]])
  expect(ev.commands[0]!.output).toBe('ran 12 tests\n12 passed')
  expect(ev.ran_checks).toBe(true)
  expect(ev.checks_after_last_edit).toBe(true)
})

test('a check run before the last edit does not count as checking it', () => {
  const ev = evidence([user('do it'), said('', bash('pytest', '3 passed'), edit('/x.py'))], 6000)
  expect(ev.ran_checks).toBe(true)
  expect(ev.checks_after_last_edit).toBe(false)
  expect(evidence([user('do it'), said('', edit('/x.py'))], 6000).ran_checks).toBe(false)
})

test('the budget keeps the newest check, keeps output ends, and says how many were left out', () => {
  const long = 'line\n'.repeat(2000) + 'FAILED 1 of 40'
  const uses = [bash('echo one', 'one'), bash('cargo test', long, true), ...Array.from({ length: 30 }, (_, i) => bash(`cat f${i}`, 'z'.repeat(500)))]
  const ev = evidence([user('go'), said('', ...uses)], 1000)
  expect(ev.commands[0]!.command).toBe('cargo test')
  expect(ev.commands[0]!.failed).toBe(true)
  expect(ev.commands[0]!.output.endsWith('FAILED 1 of 40')).toBe(true)
  expect(ev.commands.length + ev.commands_left_out).toBe(32)
  expect(ev.commands_left_out).toBeGreaterThan(20)
  expect(JSON.stringify(ev).length).toBeLessThan(2000)
})

test('the questions are ones the API accepts, and the claims are the choice offered', () => {
  const found = ['Fixed it.', 'All tests pass.']
  const q = checkQuestions(questionsOf(found))
  expect(Object.keys(q)).toEqual(['claims_done', 'supported', 'cannot_tell', 'unverified_checks', 'weakest'])
  expect(q.weakest!.criteria).toEqual({ claim_0: 'Fixed it.', claim_1: 'All tests pass.', none: 'every claim is supported by the evidence' })
  expect(Object.keys(questionsOf([]))).not.toContain('weakest')
})

test('the state is redacted through the given function', () => {
  const ev = evidence([user('go'), said('', bash('echo SECRET', 'SECRET'))], 6000)
  const state = stateOf('SECRET request', 'Done SECRET', ['Done SECRET'], ev, t => t.replaceAll('SECRET', '[x]'))
  expect(JSON.stringify(state)).not.toContain('SECRET')
})

const noul = (p: number): Answer => ({ type: 'noul', noul: p })
const pick = (c: string): Answer => ({ type: 'choice', choice: c, probabilities: { [c]: 1 }, confidence: 1 })

test("answers are read only when every yes/no came back, and a pick off the list is no pick", () => {
  const found = ['Fixed it.']
  expect(answersOf({ claims_done: noul(0.9), supported: noul(0.2) }, found)).toBe(null)
  expect(answersOf({ claims_done: noul(0.9), supported: noul(0.2), unverified_checks: noul(0.1), weakest: pick('claim_0') }, found)).toBe(null) // no cannot_tell
  expect(answersOf({ claims_done: noul(0.9), supported: noul(0.2), unverified_checks: noul(0.1), cannot_tell: noul(0.3), weakest: pick('claim_0') }, found))
    .toEqual({ claims_done: 0.9, supported: 0.2, unverified_checks: 0.1, cannot_tell: 0.3, weakest: 0 })
  expect(answersOf({ claims_done: noul(0.9), supported: noul(0.2), unverified_checks: noul(0.1), cannot_tell: noul(0), weakest: pick('none') }, found)?.weakest).toBe('none')
  expect(answersOf({ claims_done: noul(0.9), supported: noul(0.2), unverified_checks: noul(0.1), cannot_tell: noul(0), weakest: pick('claim_7') }, found)?.weakest).toBe(null)
})

const ans = (supported: number, unverified_checks: number, cannot_tell: number, weakest: number | 'none' | null, claims_done = 0.9) =>
  ({ claims_done, supported, unverified_checks, cannot_tell, weakest })

test('each claim verdict: none, shown, not shown, could not tell', () => {
  const found = ['Fixed it.', 'All tests pass.']
  // no claim made
  expect(decide(ans(0, 1, 0, 1, 0.3), found, 0.7)).toEqual({ verdict: 'none' })
  // shown: Jev names none unsupported, or leans supported
  expect(decide(ans(0.2, 0.9, 0, 'none'), found, 0.7)).toEqual({ verdict: 'shown' })
  expect(decide(ans(0.7, 0.2, 0.1, 0), found, 0.7)).toEqual({ verdict: 'shown' })
  // not shown: sure the evidence lacks it or contradicts it
  expect(decide(ans(0.2, 0.1, 0.1, 0), found, 0.7)).toEqual({ verdict: 'not-shown', claim: 'Fixed it.', checks: false, confidence: 0.8 })
  expect(decide(ans(0.9, 0.85, 0.1, 1), found, 0.7)).toEqual({ verdict: 'not-shown', claim: 'All tests pass.', checks: true, confidence: 0.85 })
  expect(decide(ans(0.2, 0.1, 0.1, null), found, 0.7)).toMatchObject({ verdict: 'not-shown', claim: null })
  // could not tell: Jev says the evidence cannot show it either way
  expect(decide(ans(0.5, 0.3, 0.8, 1), found, 0.7)).toEqual({ verdict: 'could-not-tell', claim: 'All tests pass.', confidence: 0.8, reason: 'thin' })
  // ... or a low-confidence answer: leans unshown but under minConfidence
  expect(decide(ans(0.4, 0.2, 0.1, 0), found, 0.7)).toEqual({ verdict: 'could-not-tell', claim: 'Fixed it.', confidence: 0.6, reason: 'unsure' })
})

test('the could-not-tell band is lower when the evidence was cut to fit, and never overrides a sure supported', () => {
  const found = ['Fixed it.']
  expect(decide(ans(0.5, 0.2, 0.5, 0), found, 0.7)).toMatchObject({ verdict: 'could-not-tell', reason: 'unsure' })
  expect(decide(ans(0.5, 0.2, 0.5, 0), found, 0.7, true)).toMatchObject({ verdict: 'could-not-tell', reason: 'thin' })
  expect(decide(ans(0.9, 0.1, 0.9, 0), found, 0.7)).toEqual({ verdict: 'shown' })
  // sure it is unshown and cannot-tell low: accused even when cut
  expect(decide(ans(0.1, 0.1, 0.2, 0), found, 0.7, true)).toMatchObject({ verdict: 'not-shown' })
})

test('evidence says when something was cut to fit', () => {
  expect(evidence([user('go'), said('', bash('ls', 'a'))], 6000).cut).toBe(false)
  const many = Array.from({ length: 30 }, (_, i) => bash(`cat f${i}`, 'z'.repeat(500)))
  expect(evidence([user('go'), said('', ...many)], 1000).cut).toBe(true)
  expect(evidence([user('go'), said('', bash('npm test', 'x'.repeat(5000)))], 6000).cut).toBe(true)
})

test('the nudge names the claim, asks to verify or say what is unverified, and rules out hard-to-undo steps', () => {
  const text = nudge({ verdict: 'not-shown', claim: 'All tests pass.', checks: true, confidence: 0.9 })
  expect(text.startsWith(TAG)).toBe(true)
  expect(text).toContain('"All tests pass."')
  expect(text).toContain('no run of them appears after your last change')
  expect(text).toContain('say plainly in your answer what is not verified')
  expect(text).toContain('Do not take destructive or hard-to-undo steps')
  expect(nudge({ verdict: 'not-shown', claim: null, checks: false, confidence: 0.9 })).toContain('that the work is complete')
})

test('the could-not-tell note is shorter, names the claim, and asks only to say it is unverified', () => {
  const text = unverifiedNote({ verdict: 'could-not-tell', claim: 'All tests pass.', confidence: 0.8, reason: 'thin' })
  expect(text.startsWith(TAG)).toBe(true)
  expect(text).toContain('"All tests pass."')
  expect(text).toContain('Run nothing more')
  expect(text).toContain('unverified')
  expect(text).not.toContain('verify it now')
  expect(text.length).toBeLessThan(nudge({ verdict: 'not-shown', claim: 'All tests pass.', checks: false, confidence: 0.9 }).length)
})

test('nudges are capped per prompt and start again with the next one', () => {
  let cap = { key: null as string | null, given: 0 }
  expect(mayNudge(cap, 'p1', 2)).toBe(true)
  cap = nudged(cap, 'p1')
  cap = nudged(cap, 'p1')
  expect(mayNudge(cap, 'p1', 2)).toBe(false)
  expect(mayNudge(cap, 'p2', 2)).toBe(true)
  expect(nudged(cap, 'p2')).toEqual({ key: 'p2', given: 1 })
  expect(mayNudge({ key: null, given: 0 }, 'p1', 0)).toBe(false)
})

test('words that only look like a finish are not claims', () => {
  for (const text of ['The command was held because the path is outside the working directory.',
    "I didn't write the file.", "I won't say the tests pass: none ran.", 'The green button is ready-made.'])
    expect(claimsCompletion(text)).toBe(false)
  for (const text of ['It works now.', 'Ready to merge.', 'Created the file; everything is working.'])
    expect(claimsCompletion(text)).toBe(true)
})

test('quoted words and inline code are talked about, not claimed, and are shown as written', () => {
  expect(claims('"Done." only meant the command ended.')).toEqual([])
  expect(claims('I left out the word "done" on purpose; see `tests pass`.')).toEqual([])
  expect(claims('Fixed the `parse()` bug in "lexer.ts".')).toEqual(['Fixed the parse() bug in "lexer.ts".'])
})

// ── what real use flagged wrongly ────────────────────────────────────────────

test('commands from before the latest request are shown too, tagged earlier, after this turn\'s', () => {
  const messages = [
    user('push it and check CI'),
    said('', bash('gh run list --limit 3', 'completed\tsuccess\tc39353a fix\tCI\tmain\tpush\t12345678901\t1m\t2m')),
    user('thanks, is CI green?'),
    said('', bash('git status', 'clean')),
  ]
  const ev = evidence(messages, 6000)
  expect(ev.commands.map(c => [c.command, c.earlier ?? false])).toEqual([['gh run list --limit 3', true], ['git status', false]])
  expect(ev.ran_checks).toBe(true)
  expect(ev.checks_after_last_edit).toBe(true)
  // the current turn fills the budget first: a tight budget drops the earlier command, not this turn's
  const tight = evidence([...messages.slice(0, 3), said('', bash('git status', 'x'.repeat(150)))], 330)
  expect(tight.commands.map(c => c.command)).toEqual(['git status'])
  expect(tight.commands_left_out).toBe(1)
})

test('an edit after an earlier check means the check no longer shows the work', () => {
  const ev = evidence([user('a'), said('', bash('npm test', '12 passed')), user('b'), said('', edit('/src/x.ts'))], 6000)
  expect(ev.ran_checks).toBe(true)
  expect(ev.checks_after_last_edit).toBe(false)
})

test('the nudge says what was read, not that nothing in the session shows it', () => {
  const text = nudge({ verdict: 'not-shown', claim: 'CI passed.', checks: false, confidence: 0.9 })
  expect(text).not.toContain("nothing in this session's tool output")
  expect(text).toContain('earlier commands')
})

test('caveats, interruptions and skill bodies are not the request', () => {
  for (const text of ['Caveat: The messages below were generated by the user while running local commands.',
    '[Request interrupted by user]', 'Base directory for this skill: /home/u/.claude/skills/tdd\n\n# TDD\nWrite the test first.'])
    expect(isRequest(user(text))).toBe(false)
  expect(requestIndex([user('fix it'), said('ok'), user('[Request interrupted by user for tool use]')])).toBe(0)
  expect(isRequest(user('Caveat emptor: fix the price parser'))).toBe(true)
})

test('CI, PR checks and type checks are checks; a check word given to grep, cat or ls is not', () => {
  for (const command of ['gh run list --limit 5', 'gh run view 123 --log-failed', 'gh run watch', 'gh pr checks 12',
    'npm run typecheck', 'pnpm typecheck', 'npm run ci', 'cd app && npm test 2>&1 | tail -20'])
    expect(evidence([user('go'), said('', bash(command, 'ok'))], 6000).ran_checks).toBe(true)
  for (const command of ['grep -rn test src', 'rg "build" .', 'cat tests/a.ts', 'ls test', 'sed -n 1,20p test/x.ts',
    'head -5 build.log', 'tail -n 20 lint.txt', 'npm ci'])
    expect(evidence([user('go'), said('', bash(command, 'ok'))], 6000).ran_checks).toBe(false)
})

test('long output keeps its head and its tail', () => {
  const runs = 'completed\tsuccess\tc39353a newest\n' + 'completed\tfailure\told\n'.repeat(200) + 'END'
  const ev = evidence([user('go'), said('', bash('git log --oneline', runs))], 6000)
  expect(ev.commands[0]!.output.startsWith('completed\tsuccess\tc39353a')).toBe(true)
  expect(ev.commands[0]!.output.endsWith('END')).toBe(true)
  expect(ev.commands[0]!.output).toContain('…')
})

test('big checks do not push every other command out: after the newest check, newest first', () => {
  const big = 'x'.repeat(5000) + '\n40 passed'
  const uses = [bash('npm test', big), bash('pytest', big), bash('git push', 'pushed'), bash('git log -1', 'c39353a done')]
  const ev = evidence([user('go'), said('', ...uses)], 2000)
  const kept = ev.commands.map(c => c.command)
  expect(kept).toContain('pytest')
  expect(kept).toContain('git log -1')
  expect(kept).toContain('git push')
  expect(ev.commands.find(c => c.command === 'pytest')!.output.endsWith('40 passed')).toBe(true)
})

test('editing only docs or memory after the checks still counts as checked', () => {
  for (const path of ['/p/README.md', '/home/u/.claude/projects/p/memory/notes.md', '/p/docs/guide.mdx'])
    expect(evidence([user('go'), said('', edit('/p/src/a.ts'), bash('npm test', 'ok'), edit(path))], 6000).checks_after_last_edit).toBe(true)
  expect(evidence([user('go'), said('', bash('npm test', 'ok'), edit('/p/src/a.ts'), edit('/p/README.md'))], 6000).checks_after_last_edit).toBe(false)
})

test('short git hashes and run ids stay readable to Jev; secrets, bare full hashes and phones are still masked', () => {
  const keep = keepIds(redact)
  const sha = 'c39353a9f1e2d3c4b5a69788776655443322110f'
  const out = keep(`completed\tsuccess\tc39353a fix\tCI\tmain\nrun https://github.com/o/r/actions/runs/9876543210\nrun 12345678901 and job #4567890123\n`
    + `commit ${sha}\n{"headSha":"${sha}"}`, 4000)
  expect(out).toContain('c39353a fix')
  expect(out).toContain('runs/9876543210')
  expect(out).toContain('run 12345678901')
  expect(out).toContain('#4567890123')
  expect(out).toContain(`commit ${sha}`)
  expect(out).toContain(`"headSha":"${sha}"`)
  // a full-length hex with no git label is masked as before: it could be a token
  expect(keep(`token ${sha} here`, 4000)).toBe('token [hex] here')
  expect(keep('c39353a9f1e2d3c4b5', 4000)).toBe('c39353a9f1e2d3c4b5') // longer than a short hash: left to redact
  // a phone in a tab-separated line is masked, as redact masks it
  expect(keep('completed\tsuccess\tc39353a\t4155550134\t1m', 4000)).toContain('[phone]')
  const secret = keep(`GITHUB_TOKEN=${sha} and GH_TOKEN=c39353a and ghp_abcdefghijklmnopqrstuvwxyz0123 and call 415 555 0134 and AKIAABCDEFGHIJKLMNOP`, 4000)
  expect(secret).not.toContain(sha)
  expect(secret).toContain('GH_TOKEN=[secret]')
  expect(secret).not.toContain('ghp_')
  expect(secret).not.toContain('AKIA')
  expect(secret).toContain('[phone]')
  expect([...keep('c39353a '.repeat(100), 100)].length).toBeLessThan(120)
})

test('plans, conditionals, questions and unfinished work are not claims', () => {
  for (const text of ['I will run the tests and confirm they pass.', "I'll fix the parser next.", "I'm going to make it pass.",
    'Once CI passes, it is ready to merge.', 'If the tests pass, we are done.', 'When the build is green, ship it.',
    'Next, verify the fix.', 'Want me to push the fixed branch?', 'Should I merge now that it passes?', 'Is it working on your side?',
    'The migration is not done yet.', 'Nothing is done until the review.', 'The plan: fix the parser, then confirm.'])
    expect(claims(text)).toEqual([])
  expect(claims('Fixed the parser. All 12 tests pass. I will open the PR next.')).toEqual(['Fixed the parser.', 'All 12 tests pass.'])
})

test("when Jev picks no claim as unsupported, the gate does not nudge with a generic one", () => {
  const found = ['Fixed it.']
  expect(answersOf({ claims_done: noul(0.9), supported: noul(0.2), unverified_checks: noul(0.1), cannot_tell: noul(0), weakest: pick('none') }, found)?.weakest).toBe('none')
  expect(decide({ claims_done: 0.9, supported: 0.2, unverified_checks: 0.9, cannot_tell: 0, weakest: 'none' }, found, 0.7)).toEqual({ verdict: 'shown' })
})

test('an unverified completion claim with no evidence at all is still nudged', () => {
  const found = claims('Done. All tests pass and CI is green.')
  expect(found.length).toBeGreaterThan(0)
  const ev = evidence([user('fix the parser'), said('Done. All tests pass and CI is green.')], 6000)
  expect(ev.commands).toEqual([])
  expect(ev.ran_checks).toBe(false)
  const v = decide({ claims_done: 0.95, supported: 0.05, unverified_checks: 0.9, cannot_tell: 0.1, weakest: 0 }, found, 0.7)
  expect(v).toMatchObject({ verdict: 'not-shown', claim: found[0], checks: true })
  expect(nudge(v as Extract<typeof v, { verdict: 'not-shown' }>)).toContain(`"${found[0]}"`)
})

// ── stopping short ─────────────────────────────────────────────────────────────

test('a final sentence that promises the next step is a candidate, with its step', () => {
  expect(unfinishedStep('Parser fixed. Let me run the tests next.')).toEqual({ sentence: 'Let me run the tests next.', step: 'run the tests', kind: 'promise' })
  expect(unfinishedStep('Next I\'ll update the docs.')).toMatchObject({ kind: 'promise', step: 'update the docs' })
  expect(unfinishedStep("Now I'm going to fix the failing import.")).toMatchObject({ kind: 'promise', step: 'fix the failing import' })
  expect(unfinishedStep('The next step is to add a test.')).toMatchObject({ kind: 'promise', step: 'add a test' })
})

test('a final sentence that asks leave for work is a candidate, with its step', () => {
  expect(unfinishedStep('I found the bug in parse(). Want me to go ahead and fix it?')).toEqual({ sentence: 'Want me to go ahead and fix it?', step: 'fix it', kind: 'permission' })
  expect(unfinishedStep('Shall I run the tests?')).toMatchObject({ kind: 'permission', step: 'run the tests' })
  expect(unfinishedStep("Let me know if you'd like me to update the docs.")).toMatchObject({ kind: 'permission', step: 'update the docs' })
  expect(unfinishedStep("I can fix the types if you'd like.")).toMatchObject({ kind: 'permission', step: 'fix the types' })
})

test('real questions, choices, waiting and mid-message promises are not candidates', () => {
  for (const text of ['Which file should I edit?', 'Should I use Postgres or SQLite?', 'What should the endpoint be called?',
    'Do you want the old behaviour or the new one?', 'Let me know if you need anything else.', "I'll wait for your answer.",
    'I ran the tests. They pass.', 'Let me run the tests next. All 12 pass.', 'If the build fails, let me look at it.',
    'Which of these two do you prefer?', 'I need access to the staging server to continue.'])
    expect(unfinishedStep(text)).toBe(null)
})

test('a pending step that is hard to undo is recognised, so the agent is never sent back to take it', () => {
  for (const step of ['push the branch', 'deploy it to production', 'delete the old files', 'install the dependencies', 'run the migration', 'migrate the database', 'send the email',
    'force push', 'merge the PR', 'publish the package'])
    expect(isConsequential(step)).toBe(true)
  for (const step of ['run the tests', 'update the docs', 'fix it', 'add a test', 'read the config'])
    expect(isConsequential(step)).toBe(false)
  // the candidate still parses; the glue holds it back
  expect(isConsequential(unfinishedStep('Want me to go ahead and push it?')!.step)).toBe(true)
})

test('a message that ran tools after the sentence did the step; the final text alone did not', () => {
  const sentence = 'Let me run the tests next.'
  expect(actedAfter([user('go'), said(sentence)], sentence)).toBe(false)
  expect(actedAfter([user('go'), said(sentence, bash('npm test', 'ok'))], sentence)).toBe(true)
  expect(actedAfter([user('go'), said('earlier', bash('ls', 'a')), said(sentence)], sentence)).toBe(false)
})

test('the stop-short questions are ones the API accepts, and the state holds the request, the last message and the step, redacted', () => {
  expect(Object.keys(checkQuestions(shortQuestions()))).toEqual(['stopped_short', 'requested', 'needs_person'])
  const pending = unfinishedStep('Let me run the SECRET tests next.')!
  const state = shortStateOf('fix SECRET', 'All fixed. Let me run the SECRET tests next.', pending, t => t.replaceAll('SECRET', '[x]'))
  expect(JSON.stringify(state)).not.toContain('SECRET')
  expect(Object.keys(state)).toEqual(['task', 'user_request', 'final_message', 'last_sentence', 'pending_step'])
})

test('stop-short is flagged only when asked for, left undone, and not a real question to the person', () => {
  const a = { type: 'noul' as const }
  expect(shortAnswersOf({ stopped_short: { ...a, noul: 0.9 }, requested: { ...a, noul: 0.8 } })).toBe(null)
  expect(shortAnswersOf({ stopped_short: { ...a, noul: 0.9 }, requested: { ...a, noul: 0.8 }, needs_person: { ...a, noul: 0.1 } }))
    .toEqual({ stopped_short: 0.9, requested: 0.8, needs_person: 0.1 })
  expect(decideShort({ stopped_short: 0.9, requested: 0.8, needs_person: 0.1 }, 0.7)).toEqual({ short: true, confidence: 0.8 })
  expect(decideShort({ stopped_short: 0.9, requested: 0.4, needs_person: 0.1 }, 0.7).short).toBe(false) // not asked for
  expect(decideShort({ stopped_short: 0.5, requested: 0.9, needs_person: 0.1 }, 0.7).short).toBe(false) // done, or not a promise
  expect(decideShort({ stopped_short: 0.9, requested: 0.9, needs_person: 0.8 }, 0.7).short).toBe(false) // a real question
})

test('the stop-short note names the step, asks to do it or say why, and never urges risk', () => {
  const promise = stopShortNote(unfinishedStep('Let me run the tests next.')!)
  expect(promise.startsWith(TAG)).toBe(true)
  expect(promise).toContain('"Let me run the tests next."')
  expect(promise).toContain('run the tests')
  expect(promise).toContain('Carry it out now, or say plainly in your answer why you stopped')
  expect(promise).toContain('hard to undo')
  expect(promise).not.toContain('need their leave')
  expect(stopShortNote(unfinishedStep('Want me to go ahead and fix it?')!)).toContain('do not need their leave')
})
