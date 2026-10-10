import { test, expect } from 'claude-code/testing'
import { ALWAYS_KEEP_LAST, keepOnly, unitsOf, type Msg, type Unit } from './keep'
import { KEEP_LAST } from '../../engine/compact'

const m = (role: string, text: string, extra: Partial<Msg> = {}): Msg => ({ role, text, ...extra })
const call = (id: string, tool = 'Read', input: Record<string, unknown> = { file_path: `/p/${id}.ts` }) => ({ tool_use_id: id, tool, input })
const result = (id: string, text = `contents of ${id}`) => ({ tool_use_id: id, text, isError: false })
const tail = () => Array.from({ length: 6 }, (_, i) => m(i % 2 ? 'assistant' : 'user', `tail ${i}`))
/** The fates Jev gave, by unit: a text unit by its message index, a pair by its id. */
const fatesFor = (units: Unit[], by: Record<string, 'keep' | 'drop'>) =>
  Object.fromEntries(units.flatMap((u, j) => {
    const fate = by['text' in u ? `m${u.text}` : u.pair]
    return fate ? [[String(j), fate]] : []
  }))
const keptIdx = (messages: Msg[], by: Record<string, 'keep' | 'drop'>) => {
  const { units } = unitsOf(messages)
  return keepOnly(messages, units, fatesFor(units, by)).map(x => messages.indexOf(x))
}

test('the tail kept by message is the engine\'s own default tail', () => {
  expect(ALWAYS_KEEP_LAST).toBe(KEEP_LAST)
})

test('each message text and each tool pair is one unit; the tail is not sent', () => {
  const messages = [
    m('user', 'set up the project'),
    m('assistant', 'Let me read the file', { toolUses: [call('t1')] }),
    m('user', '', { toolResults: [result('t1')] }),
    ...tail(),
  ]
  const { units, toJev } = unitsOf(messages)
  expect(units).toEqual([{ text: 0 }, { text: 1 }, { pair: 't1' }])
  expect(toJev[2]).toEqual({ role: 'tool', content: 'tool call Read: /p/t1.ts\nresult: contents of t1' })
})

test('an unjudged tool pair is kept, whole', () => {
  const messages = [
    m('user', 'fix the build'),                                                // 0
    m('assistant', '', { toolUses: [call('t1', 'Bash', { command: 'npm test' })] }), // 1
    m('user', '', { toolResults: [result('t1', 'FAIL src/a.test.ts')] }),       // 2
    ...tail(),
  ]
  // Jev answered only the text (down for the pair's batch, a partial answer, or it was not sent)
  expect(keptIdx(messages, { m0: 'drop' })).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
})

test('a tool pair judged drop goes as a whole pair; one judged keep stays whole', () => {
  const messages = [
    m('user', 'fix the build'),                                // 0
    m('assistant', '', { toolUses: [call('t1')] }),            // 1
    m('user', '', { toolResults: [result('t1')] }),            // 2
    m('assistant', '', { toolUses: [call('t2')] }),            // 3
    m('user', '', { toolResults: [result('t2')] }),            // 4
    ...tail(),
  ]
  expect(keptIdx(messages, { m0: 'keep', t1: 'drop', t2: 'keep' })).toEqual([0, 3, 4, 5, 6, 7, 8, 9, 10])
})

test('dropping narration never removes a tool pair Jev did not judge drop', () => {
  const messages = [
    m('user', 'look at a.ts'),                                                // 0
    m('assistant', 'Let me read the file', { toolUses: [call('t1')] }),       // 1
    m('user', '', { toolResults: [result('t1')] }),                           // 2
    m('assistant', 'And the other one', { toolUses: [call('t2')] }),          // 3
    m('user', '', { toolResults: [result('t2')] }),                           // 4
    m('assistant', 'Both read', { toolUses: [call('t3')] }),                  // 5
    m('user', '', { toolResults: [result('t3')] }),                           // 6
    ...tail(),
  ]
  // t1 unjudged, t2 judged keep: their narration's drop takes neither; t3 and its narration both drop
  expect(keptIdx(messages, { m0: 'keep', m1: 'drop', m3: 'drop', t2: 'keep', m5: 'drop', t3: 'drop' }))
    .toEqual([0, 1, 2, 3, 4, 7, 8, 9, 10, 11, 12])
})

test('a kept narration keeps its call, and so the result, even when the pair was judged drop', () => {
  const messages = [
    m('assistant', 'the build needs node 20', { toolUses: [call('t1')] }),  // 0
    m('user', '', { toolResults: [result('t1')] }),                          // 1
    ...tail(),
  ]
  expect(keptIdx(messages, { m0: 'keep', t1: 'drop' })).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
})

test('a result message for two calls goes only when both pairs go', () => {
  const messages = [
    m('assistant', '', { toolUses: [call('a'), call('b')] }),       // 0
    m('user', '', { toolResults: [result('a'), result('b')] }),     // 1
    ...tail(),
  ]
  expect(keptIdx(messages, { a: 'drop' })).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  expect(keptIdx(messages, { a: 'drop', b: 'drop' })).toEqual([2, 3, 4, 5, 6, 7])
})

test('never keeps half a tool pair from the tail', () => {
  const messages = [
    m('user', 'go'),                                                         // 0
    m('assistant', '', { toolUses: [call('x')] }),                           // 1
    m('user', 't0', { toolResults: [result('x')] }),                         // 2 (tail)
    ...Array.from({ length: 5 }, (_, i) => m(i % 2 ? 'user' : 'assistant', `t${i + 1}`)),
  ]
  const { units } = unitsOf(messages)
  expect(units).toEqual([{ text: 0 }]) // the pair reaches into the tail: not sent
  expect(keptIdx(messages, { m0: 'drop', x: 'drop' })).toEqual([1, 2, 3, 4, 5, 6, 7])
})

test('a message with no fate is kept', () => {
  const messages = Array.from({ length: 10 }, (_, i) => m('user', `t${i}`))
  const { units } = unitsOf(messages)
  expect(keepOnly(messages, units, { '1': 'drop' }).map(x => messages.indexOf(x))).toEqual([0, 2, 3, 4, 5, 6, 7, 8, 9])
})

test('a tool pair is sent redacted and capped: the call, the head and tail of the result, and how much is not shown', () => {
  const key = `sk-${'A1b2C3d4'.repeat(4)}`
  const long = `first line of output\n${'x'.repeat(3000)}\nlast line: email bob@example.com`
  const messages = [
    m('assistant', '', { toolUses: [call('t1', 'Bash', { command: 'npm test', timeout: 5 })] }),
    m('user', '', { toolResults: [result('t1', long)] }),
    m('assistant', '', { toolUses: [call('t2', 'Bash', { command: `echo ${key}` })] }),
    m('user', '', { toolResults: [result('t2', 'ok')] }),
    ...tail(),
  ]
  const { units, toJev } = unitsOf(messages)
  expect(units).toEqual([{ pair: 't1' }]) // t2's call holds a key: never sent, so unjudged and kept
  const sent = toJev[0]!.content
  expect(sent.startsWith('tool call Bash: npm test\nresult: first line of output')).toBe(true)
  expect(sent).toMatch(/\n… \d+ chars not shown …\n/)
  expect(sent.endsWith('last line: email [email]')).toBe(true)
  expect([...sent].length).toBeLessThanOrEqual(700)
  expect(JSON.stringify(toJev)).not.toContain(key)
})
