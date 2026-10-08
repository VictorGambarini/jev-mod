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
const features = [...FEATURES, gate]

test('the words, a feature, its modes, settings and reset; --project anywhere', () => {
  expect(parse('', features)).toEqual({ kind: 'list' })
  expect(parse('  list ', features)).toEqual({ kind: 'list' })
  expect(parse('Status', features)).toEqual({ kind: 'status' })
  expect(parse('compact', features)).toEqual({ kind: 'compact' })
  expect(parse('dashboard', features)).toEqual({ kind: 'dashboard' })
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
