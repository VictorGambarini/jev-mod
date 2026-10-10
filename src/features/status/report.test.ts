import { test, expect } from 'claude-code/testing'
import { report, scrub, type Facts } from './report'

const base: Facts = {
  version: '0.4.0', backend: null, provider: 'typesafe', keySource: 'settings', gateway: null, misconfigured: null,
  check: { ok: true, model: 'jev-1.13.0', ms: 412, cost: 0.000021 },
  features: [{ id: 'routing', mode: 'on', source: 'default' }, { id: 'skills', mode: 'on', source: 'default' },
    { id: 'screening', mode: 'on', source: 'default' }],
  private: false, problems: [], budget: { spent: 0.0017, daily: 1 },
}

test('a working setup reads as one line each: backend, key source, check, switches, budget', () => {
  expect(report(base)).toBe([
    'jev-mod 0.4.0',
    'backend: Jev through TypeSafe',
    "key: from this mod's settings (Claude Code's credential store)",
    'check: ok, answered by jev-1.13.0 in 412 ms ($0.00002)',
    'features: routing on · skills on · screening on',
    'today: $0.0017 of the $1.00 daily budget',
  ].join('\n'))
})

test('a failure says what to do, for a provider and for a named backend', () => {
  const noKey = report({ ...base, provider: 'absent', keySource: 'none', check: { ok: false, error: 'no_key', said: '' } })
  expect(noKey).toContain('backend: none (no key found')
  expect(noKey).toContain("check: failed (no_key). Set a key in jev-mod's settings: /plugin, or `claude plugin configure jev-mod@jev-mod")
  const refused = report({ ...base, backend: { name: 'lais05', model: 'clef-flash', url: 'https://x/v1/systemone' },
    keySource: 'file', check: { ok: false, error: 'auth_failed', said: 'HTTP 401: bad key' } })
  expect(refused).toContain('backend: lais05 · clef-flash at https://x/v1/systemone')
  expect(refused).toContain('check: failed (auth_failed): HTTP 401: bad key. The server refused the key: set the named backend key')
  const set = report({ ...base, private: true, problems: ['user config: no feature skils (there are routing, skills)'],
    features: [{ id: 'routing', mode: 'off', source: '/config' }, { id: 'skills', mode: 'shadow', source: 'project' },
      { id: 'screening', mode: 'off', source: 'kill file' }] })
  expect(set).toContain('features: routing off (/config) · skills shadow (project) · screening off (kill file) · private (nothing is sent)')
  expect(set).toContain('config: user config: no feature skils (there are routing, skills)')
})

test('what routing holds to this session, and a refused key or spent budget, say what happens next', () => {
  const held = report({ ...base, routing: { personModel: 'claude-opus-5-5', drift: 'Jev 1.14 ≠ tuned 1.13', untuned: 'lais05' } })
  expect(held).toContain('routing: holding your /model (claude-opus-5-5) this session')
  expect(held).toContain('routing: not routed · Jev 1.14 ≠ tuned 1.13')
  expect(held).toContain('routing: the lane policy was not tuned for lais05')
  expect(report({ ...base, check: { ok: false, error: 'credits_exhausted', said: '' } })).toContain('stops asking for 30 minutes')
  expect(report({ ...base, check: { ok: false, error: 'http_500', said: '' } })).toContain('The backend did not answer')
  expect(report({ ...base, check: { ok: false, error: 'skipped_budget', said: '' } })).toContain("Today's daily budget is spent")
})

test('a key echoed back by a server never reaches the screen', () => {
  expect(scrub('HTTP 401: key sk-test-0123456789 is not valid', ['sk-test-0123456789', undefined, 'short'])).toBe('HTTP 401: key [key] is not valid')
})
