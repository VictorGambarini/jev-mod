import { test, expect } from 'claude-code/testing'
import { problems, resolve, snapshot, write } from './config'
import type { IO } from './io'
import { checkKnob, FEATURES, feature, type Feature } from './registry'
import { isPrivate } from './settings'

const USER = '/home/u/.config/jev-mod/config.json'
const PROJECT = '/p/.claude/jev-mod.json'
const JEV = '/home/u/.config/jev'

function io(options: Record<string, string | boolean>, files: Record<string, string>, root: string | null = '/p'): IO & { files: Record<string, string> } {
  return {
    files,
    option: name => options[name],
    readFile: async path => { if (path in files) return files[path]; throw new Error('ENOENT') },
    writeFile: async (path, text) => { files[path] = text },
    env: async () => undefined, home: async () => '/home/u', projectRoot: async () => root ?? undefined,
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
  } as unknown as IO & { files: Record<string, string> }
}

const conf = (features: Record<string, unknown>) => JSON.stringify({ features })
const skills = feature('skills') as Feature
const routing = feature('routing') as Feature

async function at(options: Record<string, string | boolean>, files: Record<string, string>, f = skills) {
  const r = resolve(await snapshot(io(options, files)), f)
  return `${r.mode} ${r.source}`
}

test('a mode: kill file, then /config off, then the project, then the user, then older switches, then the default', async () => {
  const state = { [`${JEV}/state.json`]: JSON.stringify({ hook_skills: 'shadow', hook_screen: 'bogus' }) }
  expect(await at({}, {})).toBe('on default')
  expect(await at({}, state)).toBe('shadow older setting')
  expect(await at({}, state, feature('screening'))).toBe('off older setting') // what jev-skills reads as off stays off
  expect(await at({ skills: 'default' }, state)).toBe('shadow older setting')
  expect(await at({ skills: 'off' }, state)).toBe('off older setting') // a /config field set wins over state.json
  expect(await at({ skills: 'off' }, { ...state, [USER]: conf({ skills: { mode: 'on' } }) })).toBe('on user')
  expect(await at({}, { [USER]: conf({ skills: { mode: 'off' } }), [PROJECT]: conf({ skills: { mode: 'shadow' } }) })).toBe('shadow project')
  expect(await at({ enabled: false }, { [PROJECT]: conf({ skills: { mode: 'on' } }) })).toBe('off /config')
  expect(await at({}, { [PROJECT]: conf({ skills: { mode: 'on' } }), [`${JEV}/HOOK_SKILLS_OFF`]: '' })).toBe('off kill file')
  expect(await at({}, { [PROJECT]: conf({ skills: { mode: 'on' } }), '/home/u/.config/jev-mod/SKILLS_OFF': '' })).toBe('off kill file')
  expect(await at({}, { '/home/u/.config/jev-mod/OFF': '' }, routing)).toBe('off kill file')
  expect(await at({ routing: 'on' }, {}, routing)).toBe('on default') // a /config field at its default sets nothing
  expect(await at({ routing: 'off' }, {}, routing)).toBe('off older setting')
})

test('a typo never turns a feature off: what does not check is passed over and reported', async () => {
  const files = { [USER]: conf({ skills: { mode: 'shadow' }, routing: { mode: 'shadow' }, skils: { mode: 'on' } }), [PROJECT]: '{' }
  const snap = await snapshot(io({}, files))
  expect(`${resolve(snap, routing).mode} ${resolve(snap, routing).source}`).toBe('on default') // routing has no shadow
  expect(resolve(snap, skills).mode).toBe('shadow')
  expect(problems(snap)).toEqual([
    `${PROJECT} is not JSON; its settings are passed over`,
    'user config: routing: mode must be off, on, not "shadow"',
    `user config: no feature skils (there are ${FEATURES.map(f => f.id).join(', ')})`,
  ])
  expect(problems(await snapshot(io({}, { [USER]: '[]' })))).toEqual(['user config: "features" must be an object of feature settings'])
})

const gate: Feature = {
  id: 'stop-gate', title: 'Completion gate', summary: '', help: '', modes: ['off', 'shadow', 'on'], default: 'shadow',
  knobs: {
    maxNudges: { type: 'int', title: '', help: '', default: 2, min: 0, max: 5 },
    minConfidence: { type: 'number', title: '', help: '', default: 0.7, min: 0, max: 1 },
    strict: { type: 'boolean', title: '', help: '', default: false },
    tone: { type: 'choice', title: '', help: '', default: 'brief', options: ['brief', 'full'] },
  },
}

test('knobs read as their type, the project over the user, and the default where nothing checks', async () => {
  const files = { [USER]: conf({ 'stop-gate': { maxNudges: 4, minConfidence: 2, strict: 'yes' } }), [PROJECT]: conf({ 'stop-gate': { maxNudges: 1, tone: 'full' } }) }
  const snap = await snapshot(io({}, files), [gate])
  const r = resolve(snap, gate)
  expect(r.mode).toBe('shadow')
  expect(r.knobs).toEqual({
    maxNudges: { value: 1, source: 'project' }, minConfidence: { value: 0.7, source: 'default' },
    strict: { value: false, source: 'default' }, tone: { value: 'full', source: 'project' },
  })
  expect(problems(snap, [gate])).toEqual([
    'user config: stop-gate.minConfidence must be a number from 0 to 1, not 2',
    'user config: stop-gate.strict must be true or false, not "yes"',
  ])
  expect(checkKnob(gate, 'maxNudges', '3')).toEqual({ value: 3 })
  expect(checkKnob(gate, 'maxNudges', '2.5')).toEqual({ problem: 'stop-gate.maxNudges must be a whole number from 0 to 5, not "2.5"' })
  expect(checkKnob(gate, 'strict', 'on')).toEqual({ value: true })
  expect(checkKnob(gate, 'nudges', 1)).toEqual({ problem: 'stop-gate has no setting nudges (it has maxNudges, minConfidence, strict, tone)' })
})

test('a write checks first, keeps the rest of the file, and clears with undefined', async () => {
  const files: Record<string, string> = { [USER]: JSON.stringify({ note: 'mine', features: { routing: { mode: 'off' } } }) }
  const fake = io({}, files)
  expect(await write(fake, 'user', 'stop-gate', 'maxNudges', '9', [gate])).toEqual({ problem: 'stop-gate.maxNudges must be a whole number from 0 to 5, not "9"' })
  expect(await write(fake, 'user', 'stop-gate', 'maxNudges', '3', [gate])).toEqual({ ok: true, path: USER })
  expect(JSON.parse(files[USER])).toEqual({ note: 'mine', features: { routing: { mode: 'off' }, 'stop-gate': { maxNudges: 3 } } })
  expect(await write(fake, 'project', 'skills', 'mode', 'Shadow')).toEqual({ ok: true, path: PROJECT })
  expect(JSON.parse(files[PROJECT])).toEqual({ features: { skills: { mode: 'shadow' } } })
  await write(fake, 'user', 'routing', 'mode', undefined)
  expect(JSON.parse(files[USER])).toEqual({ note: 'mine', features: { 'stop-gate': { maxNudges: 3 } } })
  expect(await write(fake, 'user', 'nope', 'mode', 'on')).toEqual({ problem: `no feature nope (there are ${FEATURES.map(f => f.id).join(', ')})` })
  expect(await write(io({}, { [USER]: '{' }), 'user', 'skills', 'mode', 'on')).toEqual({ problem: `${USER} is not JSON; fix or remove it first` })
  expect(await write(io({}, {}, null), 'project', 'skills', 'mode', 'on')).toEqual({ problem: 'this session has no project folder to keep a project setting in' })
})

test('every shipped feature declares a default it has, and help to show', () => {
  for (const f of FEATURES) {
    expect(f.modes.includes(f.default)).toBe(true)
    expect(f.help.length).toBeGreaterThan(20)
    for (const knob of Object.values(f.knobs)) expect('problem' in checkKnob(f, Object.keys(f.knobs)[0], knob.default)).toBe(false)
  }
})

test('private follows the setting, or routing.json', async () => {
  expect(await isPrivate(io({ private: true }, {}), '/c')).toBe(true)
  expect(await isPrivate(io({ private: 'true' }, {}), '/c')).toBe(true)
  expect(await isPrivate(io({}, {}), '/c')).toBe(false)
  expect(await isPrivate(io({}, { '/c/routing.json': JSON.stringify({ private_profiles: ['default'] }) }), '/c')).toBe(true)
})
