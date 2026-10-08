import { test, expect } from 'claude-code/testing'
import { line, money, plain, shortModel } from './line'

test('a routed turn reads as difficulty, model and effort, cost, and the backend', () => {
  const got = line({ routing: { lane: 'small', lastModel: 'claude-haiku-4-5-20251001', changed: true, effort: 'low' },
    jev: { calls: 112, cost: 0.0043, model: 'typesafe/jev-1.13-20260917', error: null } }, 0)
  expect(plain(got!)).toBe('🧭 easy → haiku 4.5 · low  $0.0043 (112)  🔌 jev-1.13 · typesafe')
})

test('kept, withheld, failing, and nothing yet', () => {
  const kept = line({ routing: { lane: 'high', changed: false }, screening: { withheld: 2 },
    jev: { calls: 3, cost: 0.00002, model: 'Cloudflare/clef-flash', error: 'network', retryAt: 90_000 } }, 0)!
  expect(plain(kept)).toBe('🧭 hard · kept  $0.00002 (3)  🛡 withheld 2  🔌 clef-flash · Cloudflare ✗ network, retry in 2m')
  expect(kept.find(s => s.text.startsWith('🔌'))!.color).toBe('red')
  expect(plain(line({}, 0)!)).toBe('🧭 jev-mod ready · judges your next prompt')
  expect(plain(line({ routing: { lane: 'as is' }, jev: { calls: 1, cost: 0 } }, 0)!)).toBe('🧭 not routed  $0.00000 (1)  🔌 jev')
})

test('model names and money', () => {
  expect([shortModel('claude-sonnet-5-5'), shortModel('claude-opus-5-5'), shortModel('claude-fable-5-1'), shortModel('gpt-x')])
    .toEqual(['sonnet 5.5', 'opus 5.5', 'fable 5.1', 'gpt-x'])
  expect([money(1.234), money(0.0123), money(0.00002)]).toEqual(['$1.23', '$0.0123', '$0.00002'])
})
