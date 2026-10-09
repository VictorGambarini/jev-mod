import { test, expect } from 'claude-code/testing'
import type { Resolved } from '../../core/config'
import { feature, type Feature } from '../../core/registry'
import { list, show, usage, written } from './format'

const gate: Feature = {
  id: 'stop-gate', title: 'Completion gate', summary: 'Nudges an unfinished turn', help: 'on: nudges. shadow: counts.',
  modes: ['off', 'shadow', 'on'], default: 'shadow',
  knobs: { maxNudges: { type: 'int', title: 'Most nudges', help: 'How many times a turn is nudged.', default: 2, min: 0, max: 5 } },
}
const skills = feature('skills') as Feature
const at = (mode: Resolved['mode'], source: Resolved['source'], knobs: Resolved['knobs'] = {}): Resolved => ({ mode, source, knobs })

test('the list: each feature, its mode and where that came from, its settings, then problems and files', () => {
  expect(list('0.6.0', [
    { feature: skills, resolved: at('on', 'default') },
    { feature: gate, resolved: at('off', 'kill file', { maxNudges: { value: 3, source: 'project' } }) },
  ], ['user config: no feature skils (there are routing, skills)'], { user: '/u/config.json', project: '/p/.claude/jev-mod.json' })).toBe([
    'jev-mod 0.6.0',
    'skills     on      Suggests the installed skill that matches a prompt',
    'stop-gate  off     Nudges an unfinished turn (from a kill file)',
    '           maxNudges = 3 (from the project file)',
    'config: user config: no feature skils (there are routing, skills)',
    'files: user /u/config.json · project /p/.claude/jev-mod.json',
    '/jev-mod <feature> for its help and settings; /jev-mod help for the rest.',
  ].join('\n'))
})

test("a feature's page: help, modes, and each setting with its range, default and value now", () => {
  expect(show({ feature: gate, resolved: at('on', 'user', { maxNudges: { value: 2, source: 'default' } }) })).toBe([
    'stop-gate: Completion gate, on (from your file)',
    'Nudges an unfinished turn',
    'on: nudges. shadow: counts.',
    'modes: off, shadow, on (default shadow)',
    'maxNudges: Most nudges. How many times a turn is nudged. (whole number 0 to 5; default 2; now 2)',
    'set: /jev-mod stop-gate off|shadow|on · /jev-mod stop-gate <setting> <value> · /jev-mod stop-gate reset · add --project for this project only',
  ].join('\n'))
  expect(show({ feature: skills, resolved: at('on', 'default') })).toContain('settings: none')
})

test('a write says what it left, and warns when a layer above still decides', () => {
  expect(written(skills, 'mode', 'user', '/u/c.json', at('shadow', 'user'))).toBe('set skills in /u/c.json\nskills is shadow (from your file)')
  expect(written(skills, 'mode', 'user', '/u/c.json', at('on', 'project'))).toBe([
    'set skills in /u/c.json', 'skills is on (from the project file)',
    'warning: the project file still decides it; /jev-mod skills reset --project lets your file decide.',
  ].join('\n'))
  expect(written(skills, 'mode', 'project', '/p/j.json', at('off', 'kill file'), ['/u/jev-mod/SKILLS_OFF']))
    .toContain('warning: a kill file still decides it; remove /u/jev-mod/SKILLS_OFF to let it take effect.')
  expect(written(skills, 'mode', 'user', '/u/c.json', at('off', '/config'))).toContain('tick "jev-mod on" in /config')
  expect(written(gate, 'maxNudges', 'user', '/u/c.json', at('shadow', 'default', { maxNudges: { value: 1, source: 'project' } }))).toBe([
    'set stop-gate.maxNudges in /u/c.json', 'stop-gate.maxNudges is 1 (from the project file)',
    'warning: the project file still sets maxNudges; /jev-mod stop-gate maxNudges <value> --project to change it.',
  ].join('\n'))
  expect(written(skills, null, 'user', '/u/c.json', at('on', 'default'))).toBe('cleared skills in /u/c.json\nskills is on (the default)')
})

test('usage leads with the problem', () => {
  expect(usage('no feature x').split('\n')[0]).toBe('no feature x')
  expect(usage()).toContain('/jev-mod status | compact | dashboard | access | help')
})
