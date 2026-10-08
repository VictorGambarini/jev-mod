import { test, expect } from 'claude-code/testing'
import { keepOnly } from './keep'


test('jev-mod compact keeps what Jev marks keep, the tail, and both halves of a tool call', () => {
  const m = (role: string, text: string, extra: object = {}) => ({ role, text, ...extra })
  const messages = [
    m('user', 'set up the project'),                                        // 0 keep
    m('assistant', 'chatter'),                                              // 1 drop
    m('assistant', '', { toolUses: [{ tool_use_id: 't1' }] }),             // 2 call, no text
    m('user', '', { toolResults: [{ tool_use_id: 't1' }] }),               // 3 its result
    m('assistant', 'the build needs node 20', { toolUses: [{ tool_use_id: 't2' }] }), // 4 keep -> pulls 5
    m('user', '', { toolResults: [{ tool_use_id: 't2' }] }),               // 5
    m('user', 'ok'), m('assistant', 'a'), m('user', 'b'), m('assistant', 'c'), m('user', 'd'), m('assistant', 'e'),
  ]
  const sent = messages.map((x, i) => (x.text ? i : -1)).filter(i => i >= 0)   // [0,1,4,6,7,8,9,10,11]
  const fates: Record<string, string> = { '0': 'keep', '1': 'drop', '2': 'keep', '3': 'drop' }
  const kept = keepOnly(messages, sent, fates).map(x => messages.indexOf(x))
  expect(kept).toEqual([0, 4, 5, 6, 7, 8, 9, 10, 11])
})

test('jev-mod compact never keeps half a tool pair from the tail', () => {
  const messages = [
    { role: 'user', text: 'go' },
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'x' }] },
    ...Array.from({ length: 5 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `t${i}`,
      ...(i === 0 ? { toolResults: [{ tool_use_id: 'x' }] } : {}) })),
  ]
  const kept = keepOnly(messages, [0, 2, 3, 4, 5, 6], {}).map(x => messages.indexOf(x))
  expect(kept).toEqual([1, 2, 3, 4, 5, 6])
})
