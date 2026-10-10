import { test, expect } from 'claude-code/testing'
import { line, money, plain, shortModel } from './line'

test('a routed turn reads as difficulty, model and effort, cost, and the backend', () => {
  const got = line({ routing: { lane: 'medium', lastModel: 'claude-sonnet-4-6', changed: true, effort: 'low' },
    jev: { calls: 112, cost: 0.0043, model: 'typesafe/jev-1.13-20260917', error: null } }, 0)
  expect(plain(got!)).toBe('🧭 normal → sonnet 4.6 · low  $0.0043 (112)  🔌 jev-1.13 · typesafe')
})

test('a model with no effort set reads without one', () => {
  const got = line({ routing: { lane: 'small', lastModel: 'claude-haiku-4-5-20251001', changed: true },
    jev: { calls: 112, cost: 0.0043, model: 'typesafe/jev-1.13-20260917', error: null } }, 0)
  expect(plain(got!)).toBe('🧭 easy → haiku 4.5  $0.0043 (112)  🔌 jev-1.13 · typesafe')
})

test('kept, withheld, failing, and nothing yet', () => {
  const kept = line({ routing: { lane: 'high', changed: false }, screening: { withheld: 2 },
    jev: { calls: 3, cost: 0.00002, model: 'Cloudflare/clef-flash', error: 'network', retryAt: 90_000 } }, 0)!
  expect(plain(kept)).toBe('🧭 hard · kept  $0.00002 (3)  🛡 withheld 2  🔌 clef-flash · Cloudflare ✗ network, retry in 2m')
  expect(kept.find(s => s.text.startsWith('🔌'))!.color).toBe('red')
  const named = line({ routing: { lane: 'medium', lastModel: 'claude-sonnet-5-5', effort: 'medium', changed: false } }, 0)!
  expect(plain(named)).toBe('🧭 normal · sonnet 5.5 · medium · kept  🔌 jev')
  expect(plain(line({}, 0)!)).toBe('🧭 jev-mod ready · judges your next prompt')
  expect(plain(line({ routing: { lane: 'as is' }, jev: { calls: 1, cost: 0 } }, 0)!)).toBe('🧭 not routed  $0.00000 (1)  🔌 jev')
})

test('model names and money', () => {
  expect([shortModel('claude-sonnet-5-5'), shortModel('claude-opus-5-5'), shortModel('claude-fable-5-1'), shortModel('gpt-x')])
    .toEqual(['sonnet 5.5', 'opus 5.5', 'fable 5.1', 'gpt-x'])
  expect([money(1.234), money(0.0123), money(0.00002)]).toEqual(['$1.23', '$0.0123', '$0.00002'])
})

test('a running browse shows its step', () => {
  const got = line({ jev: { calls: 2, cost: 0.0001 }, browser: { running: true, line: '🌐 step 4/20 · clicked "Pricing"' } }, 0)!
  expect(plain(got)).toBe('🧭 not routed  $0.00010 (2)  🌐 step 4/20 · clicked "Pricing"  🔌 jev')
  expect(plain(line({ jev: { calls: 2, cost: 0.0001 }, browser: { running: false, line: 'old' } }, 0)!)).not.toContain('old')
})

test('before any config file exists the band says nothing is on yet, until a decision is recorded', () => {
  const hint = '🧭 jev-mod: nothing on yet · /jev-mod dashboard to choose'
  expect(plain(line({ mod: { configured: false } }, 0)!)).toBe(hint)
  expect(plain(line({ mod: { configured: true } }, 0)!)).toBe('🧭 jev-mod ready · judges your next prompt')
  expect(plain(line({ mod: { configured: false }, jev: { calls: 1, cost: 0 } }, 0)!)).toBe('🧭 not routed  $0.00000 (1)  🔌 jev')
})

test('an access category open this session shows as a warning, on the ready line too', () => {
  const ready = line({ access: { open: ['ssh (vm1)', 'keys'] } }, 0)!
  expect(plain(ready)).toBe('🧭 jev-mod ready · judges your next prompt  🔓 ssh (vm1), keys')
  expect(ready.find(s => s.text.startsWith('🔓'))!.color).toBe('yellow')
  const busy = line({ jev: { calls: 1, cost: 0 }, access: { open: ['ssh'] } }, 0)!
  expect(plain(busy)).toBe('🧭 not routed  $0.00000 (1)  🔓 ssh  🔌 jev')
  expect(plain(line({ access: { open: [] } }, 0)!)).toBe('🧭 jev-mod ready · judges your next prompt')
})
