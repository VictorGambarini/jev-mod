import { test, expect } from 'claude-code/testing'
import type { Answer } from '../../engine/client'
import { checkQuestions } from '../../engine/client'
import {
  answersOf, claims, claimsCompletion, decide, evidence, isRequest, mayNudge, nudge, nudged, questionsOf, requestIndex,
  stateOf, TAG, type Message,
} from './gate'

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
  expect(ev.commands[0]!.output_tail).toBe('ran 12 tests\n12 passed')
  expect(ev.ran_checks).toBe(true)
  expect(ev.checks_after_last_edit).toBe(true)
})

test('a check run before the last edit does not count as checking it', () => {
  const ev = evidence([user('do it'), said('', bash('pytest', '3 passed'), edit('/x.py'))], 6000)
  expect(ev.ran_checks).toBe(true)
  expect(ev.checks_after_last_edit).toBe(false)
  expect(evidence([user('do it'), said('', edit('/x.py'))], 6000).ran_checks).toBe(false)
})

test('the budget keeps the newest checks first, keeps output tails, and says how many were left out', () => {
  const long = 'line\n'.repeat(2000) + 'FAILED 1 of 40'
  const uses = [bash('echo one', 'one'), bash('cargo test', long, true), ...Array.from({ length: 30 }, (_, i) => bash(`cat f${i}`, 'z'.repeat(500)))]
  const ev = evidence([user('go'), said('', ...uses)], 1000)
  expect(ev.commands[0]!.command).toBe('cargo test')
  expect(ev.commands[0]!.failed).toBe(true)
  expect(ev.commands[0]!.output_tail.endsWith('FAILED 1 of 40')).toBe(true)
  expect(ev.commands.length + ev.commands_left_out).toBe(32)
  expect(ev.commands_left_out).toBeGreaterThan(20)
  expect(JSON.stringify(ev).length).toBeLessThan(2000)
})

test('the questions are ones the API accepts, and the claims are the choice offered', () => {
  const found = ['Fixed it.', 'All tests pass.']
  const q = checkQuestions(questionsOf(found))
  expect(Object.keys(q)).toEqual(['claims_done', 'supported', 'unverified_checks', 'weakest'])
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
  expect(answersOf({ claims_done: noul(0.9), supported: noul(0.2), unverified_checks: noul(0.1), weakest: pick('claim_0') }, found))
    .toEqual({ claims_done: 0.9, supported: 0.2, unverified_checks: 0.1, weakest: 0 })
  expect(answersOf({ claims_done: noul(0.9), supported: noul(0.2), unverified_checks: noul(0.1), weakest: pick('none') }, found)?.weakest).toBe(null)
  expect(answersOf({ claims_done: noul(0.9), supported: noul(0.2), unverified_checks: noul(0.1), weakest: pick('claim_7') }, found)?.weakest).toBe(null)
})

test('the verdict nudges only when a claim is made and Jev is sure enough it is unshown', () => {
  const found = ['Fixed it.', 'All tests pass.']
  expect(decide({ claims_done: 0.3, supported: 0, unverified_checks: 1, weakest: 1 }, found, 0.7)).toEqual({ nudge: false, why: 'no claim' })
  expect(decide({ claims_done: 0.9, supported: 0.4, unverified_checks: 0.2, weakest: 0 }, found, 0.7)).toEqual({ nudge: false, why: 'supported' })
  expect(decide({ claims_done: 0.9, supported: 0.2, unverified_checks: 0.1, weakest: 0 }, found, 0.7))
    .toEqual({ nudge: true, claim: 'Fixed it.', checks: false, confidence: 0.8 })
  expect(decide({ claims_done: 0.9, supported: 0.9, unverified_checks: 0.85, weakest: 1 }, found, 0.7))
    .toEqual({ nudge: true, claim: 'All tests pass.', checks: true, confidence: 0.85 })
  expect(decide({ claims_done: 0.9, supported: 0.2, unverified_checks: 0.1, weakest: null }, found, 0.7)).toMatchObject({ nudge: true, claim: null })
})

test('the nudge names the claim, asks to verify or say what is unverified, and rules out hard-to-undo steps', () => {
  const text = nudge({ nudge: true, claim: 'All tests pass.', checks: true, confidence: 0.9 })
  expect(text.startsWith(TAG)).toBe(true)
  expect(text).toContain('"All tests pass."')
  expect(text).toContain('no run of them appears after your last change')
  expect(text).toContain('say plainly in your answer what is not verified')
  expect(text).toContain('Do not take destructive or hard-to-undo steps')
  expect(nudge({ nudge: true, claim: null, checks: false, confidence: 0.9 })).toContain('that the work is complete')
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
