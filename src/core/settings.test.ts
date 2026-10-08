import { test, expect } from 'claude-code/testing'
import type { IO } from './io'
import { isPrivate, mode, routingOn } from './settings'

function io(options: Record<string, string | boolean>, files: Record<string, string>): IO {
  return {
    option: name => options[name], readFile: async path => { if (path in files) return files[path]; throw new Error('ENOENT') },
    env: async () => undefined, home: async () => '/home/u', run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
  } as unknown as IO
}

test('a switch: the kill file, then the setting, then jev-skills’ state.json, then on', async () => {
  const state = { '/c/state.json': JSON.stringify({ hook_skills: 'shadow', hook_screen: 'bogus' }) }
  expect(await mode(io({}, {}), '/c', 'hook_skills')).toBe('on')
  expect(await mode(io({}, state), '/c', 'hook_skills')).toBe('shadow')
  expect(await mode(io({}, state), '/c', 'hook_screen')).toBe('off') // what jev-skills reads as off stays off
  expect(await mode(io({ skills: 'default' }, state), '/c', 'hook_skills')).toBe('shadow')
  expect(await mode(io({ skills: 'on' }, state), '/c', 'hook_skills')).toBe('on')
  expect(await mode(io({ skills: 'on' }, { ...state, '/c/HOOK_SKILLS_OFF': '' }), '/c', 'hook_skills')).toBe('off')
  expect(await mode(io({}, { '/c/state.json': '{' }), '/c', 'hook_screen')).toBe('off')
})

test('private and routing follow the settings', async () => {
  expect(await isPrivate(io({ private: true }, {}), '/c')).toBe(true)
  expect(await isPrivate(io({}, {}), '/c')).toBe(false)
  expect(await isPrivate(io({}, { '/c/routing.json': JSON.stringify({ private_profiles: ['default'] }) }), '/c')).toBe(true)
  expect(routingOn(io({}, {}))).toBe(true)
  expect(routingOn(io({ routing: 'off' }, {}))).toBe(false)
})
