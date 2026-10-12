import { test, expect } from 'claude-code/testing'
import { list, show } from '../features/command/format'
import { complete, parse } from '../features/command/parse'
import { build, readLine } from '../features/dashboard/state'
import { write } from './config'
import type { IO } from './io'
import { checkKnob, feature, FEATURES, shownKnobs, type Feature } from './registry'

// browser.screenPages is a hidden knob, the task bench's own (bench/bare.ts): read from a config
// file like any other, never offered to the person and never written by /jev-mod or the dashboard.

const browser = feature('browser') as Feature
const io = (files: Record<string, string>) => ({
  option: () => undefined,
  readFile: async (path: string) => { if (path in files) return files[path]; throw new Error('ENOENT') },
  writeFile: async (path: string, text: string) => { files[path] = text },
  env: async () => undefined, home: async () => '/home/u', projectRoot: async () => '/p',
  run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
} as unknown as IO)

test('screenPages is a browser knob, true by default, and hidden', () => {
  expect(browser.knobs.screenPages).toMatchObject({ type: 'boolean', default: true, hidden: true })
  expect(shownKnobs(browser).map(([name]) => name)).toEqual(['maxSteps', 'confirmConfidence', 'stepFloor', 'headed', 'allowAttach', 'textChars'])
  // it still checks, as a file's value is read
  expect(checkKnob(browser, 'screenPages', false)).toEqual({ value: false })
  expect(checkKnob(browser, 'nope', 1)).toEqual({ problem: 'browser has no setting nope (it has maxSteps, confirmConfidence, stepFloor, headed, allowAttach, textChars)' })
})

test('/jev-mod neither offers nor sets it', () => {
  expect(parse('browser screenPages false', FEATURES)).toMatchObject({ kind: 'usage' })
  expect(complete('/jev-mod browser s', 's', FEATURES).map(s => s.text)).toEqual(['stepFloor'])
  expect(complete('/jev-mod browser screenPages ', '', FEATURES)).toEqual([])
  const now = (value: boolean, source: 'default' | 'user') => ({ mode: 'on' as const, source: 'user' as const, knobs: { screenPages: { value, source } } })
  expect(show({ feature: browser, resolved: now(true, 'default') })).not.toContain('screenPages')
  expect(list('0.13.1', [{ feature: browser, resolved: now(true, 'default') }], [], {})).not.toContain('screenPages')
  // once a file sets it, it is shown, so it is never off unseen
  expect(show({ feature: browser, resolved: now(false, 'user') })).toContain('screenPages = false (from your file)')
  expect(list('0.13.1', [{ feature: browser, resolved: now(false, 'user') }], [], {})).toContain('screenPages = false (from your file)')
})

test('the dashboard neither shows nor writes it, and config.write refuses it', async () => {
  const snap = { files: {}, state: undefined, kills: [], options: {}, problems: [], mod: '/c/jev-mod', jev: '/c/jev' }
  const state = build({ version: '0.13.1', seq: 1, now: 0, mode: 'live', features: FEATURES, snap, problems: [], paths: {}, activity: {}, days: [],
    budget: { day: 'd', spent: 0, daily: 1 }, backend: null, answered: {} })
  expect(state.features.find(f => f.id === 'browser')!.knobs.map(k => k.name)).not.toContain('screenPages')
  expect(readLine('{"id":"op-1","op":"set","scope":"user","feature":"browser","key":"screenPages","value":false}', FEATURES)).toMatchObject({ kind: 'bad' })
  const files: Record<string, string> = {}
  expect(await write(io(files), 'user', 'browser', 'screenPages', false)).toEqual({ problem: 'browser has no setting screenPages to set from here' })
  expect(files).toEqual({})
  expect('ok' in (await write(io(files), 'user', 'browser', 'textChars', 8000))).toBe(true)
})
