import { test, expect } from 'claude-code/testing'
import { ALWAYS_KEEP_LAST, cut, keepOnly, placeholder, rebuilt, saved, TRIM_MIN_CHARS, trimsOf, unitsOf, type Msg, type Unit } from './keep'
import { KEEP_LAST, TRIM_SHOWN, trimText } from '../../engine/compact'

const m = (role: string, text: string, extra: Partial<Msg> = {}): Msg => ({ role, text, ...extra })
const call = (id: string, tool = 'Read', input: Record<string, unknown> = { file_path: `/p/${id}.ts` }) => ({ tool_use_id: id, tool, input })
const result = (id: string, text = `contents of ${id}`) => ({ tool_use_id: id, text, isError: false })
const tail = () => Array.from({ length: 6 }, (_, i) => m(i % 2 ? 'assistant' : 'user', `tail ${i}`))
const big = (label: string, n = 5000) => `${label} first line\n${'y'.repeat(n)}\n${label} last line`
/** The fates Jev gave, by message index. */
const fatesFor = (units: Unit[], by: Record<number, 'keep' | 'drop'>) =>
  Object.fromEntries(units.flatMap((u, j) => (by[u.text] ? [[String(j), by[u.text]!]] : [])))
const keptIdx = (messages: Msg[], by: Record<number, 'keep' | 'drop'>) => {
  const { units } = unitsOf(messages)
  return keepOnly(messages, units, fatesFor(units, by)).map(x => messages.indexOf(x))
}

test('the tail kept by message is the engine\'s own default tail', () => {
  expect(ALWAYS_KEEP_LAST).toBe(KEEP_LAST)
})

test('only the text of a message with no tool call or result is a keep-or-drop unit; the tail is not sent', () => {
  const messages = [
    m('user', 'set up the project'),
    m('assistant', 'Let me read the file', { toolUses: [call('t1')] }),
    m('user', '', { toolResults: [result('t1')] }),
    m('assistant', 'Done reading.'),
    ...tail(),
  ]
  const { units, toJev } = unitsOf(messages)
  expect(units).toEqual([{ text: 0 }, { text: 3 }])
  expect(toJev).toEqual([{ role: 'user', content: 'set up the project' }, { role: 'assistant', content: 'Done reading.' }])
})

test('a message holding a tool call or result is never dropped, so no tool_use loses its tool_result', () => {
  const messages = [
    m('user', 'fix the build'),                                                   // 0
    m('assistant', 'Let me run it', { toolUses: [call('t1', 'Bash', { command: 'npm test' })] }), // 1
    m('user', '', { toolResults: [result('t1', 'FAIL')] }),                        // 2
    m('assistant', 'ok'),                                                         // 3
    ...tail(),
  ]
  // even a drop handed for message 1 (it is not a unit) takes nothing
  const { units } = unitsOf(messages)
  expect(keepOnly(messages, [...units, { text: 1 }], { '0': 'drop', '1': 'drop', '2': 'drop' }).map(x => messages.indexOf(x)))
    .toEqual([1, 2, 4, 5, 6, 7, 8, 9])
})

test('a text with no fate, or judged keep, is kept; the tail always is', () => {
  const messages = Array.from({ length: 10 }, (_, i) => m('user', `t${i}`))
  expect(keptIdx(messages, { 1: 'drop', 2: 'keep' })).toEqual([0, 2, 3, 4, 5, 6, 7, 8, 9])
  const { units } = unitsOf(messages)
  expect(keepOnly(messages, [...units, { text: 7 }], { [String(units.length)]: 'drop' })).toHaveLength(10)
})

test('what is sent: each pair outside the tail with its call and size; a long result by its ends, as long as may be kept; a short one whole', () => {
  const messages = [
    m('assistant', '', { toolUses: [call('long', 'Bash', { command: 'cat app.log', timeout: 5 })] }), // 0
    m('user', '', { toolResults: [result('long', big('app'))] }),                                  // 1
    m('assistant', '', { toolUses: [call('short')] }),                                            // 2
    m('user', '', { toolResults: [result('short', 'x'.repeat(TRIM_MIN_CHARS))] }),                 // 3: keep or drop only
    m('user', '', { toolResults: [result('orphan', big('orphan'))] }),                             // 4: its call is not here
    m('assistant', '', { toolUses: [call('intail', 'Bash', { command: 'ls' })] }),                  // 5
    m('user', '', { toolResults: [result('intail', big('tail'))] }),                               // 6..: the tail
    ...tail().slice(1),
  ]
  const { pairs, views } = trimsOf(messages)
  expect(pairs.map(p => p.id)).toEqual(['long', 'short'])
  expect(views[1]).toEqual({ tool: 'Read', arg: '/p/short.ts', size: TRIM_MIN_CHARS, isError: false, trim: false, head: 'x'.repeat(TRIM_MIN_CHARS), tail: '' })
  expect(views[0]).toMatchObject({ tool: 'Bash', arg: 'cat app.log', size: [...big('app')].length, isError: false, trim: true })
  expect([...views[0]!.head].length).toBe(TRIM_SHOWN)
  expect(views[0]!.head.startsWith('app first line')).toBe(true)
  expect(views[0]!.tail.endsWith('app last line')).toBe(true)
  expect(trimText(views[0]!).startsWith(`tool call Bash: cat app.log\nresult: ${[...big('app')].length} characters\nstart: app first line`)).toBe(true)
})

test('a pair whose call or result looks sensitive is not sent, so it stays whole; the text sent is redacted', () => {
  const key = `sk-${'A1b2C3d4'.repeat(4)}`
  const messages = [
    m('assistant', '', { toolUses: [call('a', 'Bash', { command: `echo ${key}` })] }),
    m('user', '', { toolResults: [result('a', big('a'))] }),
    m('assistant', '', { toolUses: [call('b', 'Bash', { command: 'env' })] }),
    m('user', '', { toolResults: [result('b', `${big('b')}\nGITHUB_TOKEN=ghp_${'Zx9y'.repeat(9)}`)] }),
    m('assistant', '', { toolUses: [call('c', 'Bash', { command: 'cat contacts.txt' })] }),
    m('user', '', { toolResults: [result('c', `${big('c')}\nmail bob@example.com`)] }),
    ...tail(),
  ]
  const { pairs, views } = trimsOf(messages)
  expect(pairs.map(p => p.id)).toEqual(['c'])
  expect(trimText(views[0]!)).toContain('mail bob@example.com') // contact details are kept by default
})

test('a trimmed result keeps the chosen start and end around a line naming the tool, its argument, the sizes and the file', () => {
  const text = big('log')
  const messages = [m('assistant', '', { toolUses: [call('t1', 'Bash', { command: 'cat\n  logs/app.log' })] }),
    m('user', '', { toolResults: [result('t1', text)] }), ...tail()]
  const p = trimsOf(messages).pairs[0]!
  const note = placeholder(p, 100, 300, '/c/s1/t1.txt')
  expect(note).toBe(`[jev-mod compact trimmed this Bash (cat logs/app.log) result: ${(text.length - 400).toLocaleString('en-US')} of its ` +
    `${text.length.toLocaleString('en-US')} characters were cut, keeping its first 100 and last 300. The full call and result are in ` +
    '/c/s1/t1.txt; Read it if you need the rest.]')
  const out = cut(text, 100, 300, note)!
  expect(out).toBe(`${text.slice(0, 100)}\n${note}\n${text.slice(-300)}`)
  expect(cut(text, 0, 0, note)).toBe(note)
  expect(cut(text, 0, 600, note)).toBe(`${note}\n${text.slice(-600)}`)
  // nothing changes when head and tail cover it, or when the line would not make it shorter
  expect(cut('short', 600, 600, note)).toBe(null)
  expect(cut('x'.repeat(700), 300, 300, note)).toBe(null)
})

test('the saved file holds the whole call and the whole result', () => {
  const text = big('out')
  const messages = [m('assistant', '', { toolUses: [call('t1', 'Bash', { command: 'make', timeout: 9 })] }),
    m('user', '', { toolResults: [{ tool_use_id: 't1', text, isError: true }] }), ...tail()]
  const file = saved(trimsOf(messages).pairs[0]!, 's1')
  expect(file).toContain('tool: Bash\ntool_use_id: t1\ninput:\n{\n  "command": "make",\n  "timeout": 9\n}')
  expect(file).toContain(`result (error), ${text.length.toLocaleString('en-US')} characters:\n${text}`)
  expect(file).toContain('(session s1)')
})

test('rebuilt: only a message with a trimmed result is rebuilt, without its handle; the call and the other results stay', () => {
  const messages = [
    m('assistant', 'reading', { toolUses: [call('a'), call('b')], handle: 'h0' }),
    m('user', '', { toolResults: [{ ...result('a', 'A'), result: { stdout: 'A' } }, { ...result('b', 'B'), result: { stdout: 'B' } }], handle: 'h1' }),
    m('user', 'next', { handle: 'h2' }),
  ]
  const out = rebuilt(messages, new Map([['a', 'A trimmed']]))
  expect(out[0]).toBe(messages[0])
  expect(out[2]).toBe(messages[2])
  expect(out[1]).toEqual({ role: 'user', text: '', toolResults: [{ tool_use_id: 'a', text: 'A trimmed', isError: false },
    { tool_use_id: 'b', text: 'B', isError: false, result: { stdout: 'B' } }] })
})

test('rebuilt: a dropped pair takes its call and its result; a message left empty goes, one left with text stays', () => {
  const messages = [
    m('assistant', 'Let me look', { toolUses: [call('a')], handle: 'h0' }),   // keeps its text
    m('user', '', { toolResults: [result('a')], handle: 'h1' }),              // left empty: goes
    m('assistant', '', { toolUses: [call('b'), call('c')], handle: 'h2' }),   // keeps c
    m('user', '', { toolResults: [result('b'), result('c')], handle: 'h3' }), // keeps c's result
    m('assistant', '', { toolUses: [call('d')], handle: 'h4' }),              // left empty: goes
    m('user', 'and this', { toolResults: [result('d')], handle: 'h5' }),      // keeps its text
  ]
  const out = rebuilt(messages, new Map(), new Set(['a', 'b', 'd']))
  expect(out).toEqual([
    { role: 'assistant', text: 'Let me look', toolUses: [] },
    { role: 'assistant', text: '', toolUses: [call('c')] },
    { role: 'user', text: '', toolResults: [result('c')] },
    { role: 'user', text: 'and this', toolResults: [] },
  ])
  // every tool_use left has its tool_result, and the other way round
  const uses = out.flatMap(x => x.toolUses ?? []).map(u => u.tool_use_id)
  const results = out.flatMap(x => x.toolResults ?? []).map(r => r.tool_use_id)
  expect(uses).toEqual(results)
})
