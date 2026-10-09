import { test, expect } from 'claude-code/testing'
import { FEATURES, type Feature } from '../../core/registry'
import { complete, parse, WORDS } from './parse'

const gate: Feature = {
  id: 'stop-gate', title: 'Completion gate', summary: 'Nudges an unfinished turn', help: '', modes: ['off', 'shadow', 'on'], default: 'shadow',
  knobs: {
    maxNudges: { type: 'int', title: 'Most nudges', help: '', default: 2, min: 0, max: 5 },
    tone: { type: 'choice', title: 'Tone', help: '', default: 'brief', options: ['brief', 'full'] },
  },
}
const features = [...FEATURES.filter(f => f.id !== gate.id), gate] // the fixture stands in for the shipped one

test('the words, a feature, its modes, settings and reset; --project anywhere', () => {
  expect(parse('', features)).toEqual({ kind: 'list' })
  expect(parse('  list ', features)).toEqual({ kind: 'list' })
  expect(parse('Status', features)).toEqual({ kind: 'status' })
  expect(parse('compact', features)).toEqual({ kind: 'compact' })
  expect(parse('dashboard', features)).toEqual({ kind: 'dashboard' })
  expect(parse('dashboard Stop', features)).toEqual({ kind: 'dashboard', stop: true })
  expect(parse('help', features)).toEqual({ kind: 'help' })
  expect(parse('skills', features)).toEqual({ kind: 'show', feature: 'skills' })
  expect(parse('skills SHADOW', features)).toEqual({ kind: 'set', feature: 'skills', key: 'mode', value: 'shadow', scope: 'user' })
  expect(parse('--project skills off', features)).toEqual({ kind: 'set', feature: 'skills', key: 'mode', value: 'off', scope: 'project' })
  expect(parse('stop-gate maxNudges 3 --project', features)).toEqual({ kind: 'set', feature: 'stop-gate', key: 'maxNudges', value: '3', scope: 'project' })
  expect(parse('stop-gate reset', features)).toEqual({ kind: 'reset', feature: 'stop-gate', scope: 'user' })
})

test('anything else says what was wrong', () => {
  expect(parse('skils on', features)).toEqual({ kind: 'usage', problem: `no feature or command skils (features: ${features.map(f => f.id).join(', ')})` })
  expect(parse('status now', features)).toEqual({ kind: 'usage', problem: 'status takes nothing after it' })
  expect(parse('dashboard now', features)).toEqual({ kind: 'usage', problem: 'dashboard takes nothing after it' })
  expect(parse('stop-gate maxNudges', features)).toEqual({ kind: 'usage', problem: 'stop-gate.maxNudges needs a value: /jev-mod stop-gate maxNudges <value>' })
  expect(parse('stop-gate loud', features)).toEqual({ kind: 'usage', problem: 'stop-gate takes off, shadow, on, reset, maxNudges, tone, not loud' })
  expect(parse('skills on please', features).kind).toBe('usage')
})

test('no feature takes a command word as its id', () => {
  for (const f of FEATURES) expect((WORDS as readonly string[]).includes(f.id)).toBe(false)
})

test('the typeahead offers the next word only after /jev-mod', () => {
  const texts = (before: string, token: string) => complete(before, token, features).map(s => s.text)
  expect(texts('/jev-mod s', 's')).toEqual(['status', 'skills', 'screening', 'stop-gate'])
  expect(texts('/jev-mod stop-gate ', '')).toEqual([]) // the engine never asks with no token
  expect(texts('/jev-mod stop-gate t', 't')).toEqual(['tone'])
  expect(texts('/jev-mod stop-gate o', 'o')).toEqual(['off', 'on'])
  expect(texts('/jev-mod stop-gate tone f', 'f')).toEqual(['full'])
  expect(texts('/jev-mod --project stop-gate tone b', 'b')).toEqual(['brief'])
  expect(texts('/jev-mod skills on --p', '--p')).toEqual(['--project'])
  expect(texts('/jev-mod skills on x', 'x')).toEqual([])
  expect(texts('/jev-mod status', 'status')).toEqual([]) // the word is typed in full
  expect(texts('please s', 's')).toEqual([])
  expect(texts('/compact s', 's')).toEqual([])
})

test('/jev-mod browser install, and the typeahead offers it', () => {
  expect(parse('browser install', FEATURES)).toEqual({ kind: 'browser-install' })
  expect(parse('browser allowAttach true', FEATURES)).toEqual({ kind: 'set', feature: 'browser', key: 'allowAttach', value: 'true', scope: 'user' })
  expect(parse('skills install', FEATURES).kind).toBe('usage')
  expect(complete('/jev-mod browser in', 'in', FEATURES).map(s => s.text)).toEqual(['install'])
})

test('/jev-mod access: show, a category on or off with an optional host, all off; the typeahead offers each word', () => {
  expect(parse('access', FEATURES)).toEqual({ kind: 'access-show' })
  expect(parse('access ssh on', FEATURES)).toEqual({ kind: 'access-set', category: 'ssh', on: true })
  expect(parse('access SSH on vm1.lab', FEATURES)).toEqual({ kind: 'access-set', category: 'ssh', on: true, host: 'vm1.lab' })
  expect(parse('access keys off', FEATURES)).toEqual({ kind: 'access-set', category: 'keys', on: false })
  expect(parse('access all off', FEATURES)).toEqual({ kind: 'access-set', category: 'all', on: false })
  expect(parse('access ftp on', FEATURES).kind).toBe('usage')
  expect(parse('access ssh on "vm1; rm"', FEATURES).kind).toBe('usage')
  expect(parse('access-gate on', FEATURES)).toEqual({ kind: 'set', feature: 'access-gate', key: 'mode', value: 'on', scope: 'user' })
  expect(complete('/jev-mod acc', 'acc', FEATURES).map(r => r.text)).toEqual(['access', 'access-gate'])
  expect(complete('/jev-mod access tu', 'tu', FEATURES).map(r => r.text)).toEqual(['tunnels'])
  expect(complete('/jev-mod access ssh o', 'o', FEATURES).map(r => r.text)).toEqual(['on', 'off'])
  expect(complete('/jev-mod access all o', 'o', FEATURES).map(r => r.text)).toEqual(['off'])
})
