import { test, expect } from 'claude-code/testing'
import { dayOf } from '../../core/activity'
import type { Snapshot } from '../../core/config'
import { FEATURES, type Feature } from '../../core/registry'
import { activityView, build, embed, lastDays, lines, pageWith, readLine, remember, type Facts } from './state'

const gate: Feature = {
  id: 'later-feature', title: 'Completion gate', summary: 'Nudges an unfinished turn', help: 'on: nudges.', modes: ['off', 'shadow', 'on'], default: 'shadow',
  knobs: {
    maxNudges: { type: 'int', title: 'Most nudges', help: 'How many.', default: 2, min: 0, max: 5 },
    tone: { type: 'choice', title: 'Tone', help: '', default: 'brief', options: ['brief', 'full'] },
    loud: { type: 'boolean', title: 'Loud', help: '', default: false },
  },
}
const features = [...FEATURES, gate]

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  files: {}, state: undefined, kills: [], options: {}, problems: [], mod: '/c/jev-mod', jev: '/c/jev', ...over,
})

const NOW = new Date(2026, 9, 9, 15, 0).getTime()

function facts(over: Partial<Facts> = {}): Facts {
  return {
    version: '0.7.0', seq: 3, now: NOW, mode: 'live', features, snap: snap(), problems: [], paths: { user: '/c/jev-mod/config.json' },
    activity: {}, days: lastDays(NOW, 14, dayOf), budget: { day: '2026-10-09', spent: 0.01, daily: 1 },
    backend: { name: null, model: null, provider: 'typesafe', keySource: 'settings', misconfigured: null, private: false },
    answered: {}, ...over,
  }
}

test('every registry feature is in the state, a later one with its knobs, nothing written for it', () => {
  const s = build(facts())
  expect(s.features.map(f => f.id)).toEqual(features.map(f => f.id))
  const g = s.features.find(f => f.id === 'later-feature')
  expect(g?.resolved.mode).toBe('shadow')
  expect(g?.resolved.source).toBe('default')
  expect(g?.knobs).toEqual([
    { name: 'maxNudges', type: 'int', title: 'Most nudges', help: 'How many.', default: 2, min: 0, max: 5 },
    { name: 'tone', type: 'choice', title: 'Tone', help: '', default: 'brief', options: ['brief', 'full'] },
    { name: 'loud', type: 'boolean', title: 'Loud', help: '', default: false },
  ])
})

test('what each scope file says, what holds, and a kill file over both', () => {
  const files = {
    user: { features: { 'later-feature': { mode: 'on', maxNudges: 4 } } },
    project: { features: { 'later-feature': { mode: 'off' } } },
  }
  let g = build(facts({ snap: snap({ files }) })).features.find(f => f.id === 'later-feature')
  expect(g?.files).toEqual({ user: { mode: 'on', maxNudges: 4 }, project: { mode: 'off' } })
  expect(g?.resolved.mode).toBe('off')
  expect(g?.resolved.source).toBe('project')
  expect(g?.resolved.knobs.maxNudges).toEqual({ value: 4, source: 'user' })
  g = build(facts({ snap: snap({ files, kills: ['/c/jev-mod/LATER_FEATURE_OFF'] }) })).features.find(f => f.id === 'later-feature')
  expect(g?.resolved.source).toBe('kill file')
  expect(g?.killedBy).toEqual(['/c/jev-mod/LATER_FEATURE_OFF'])
  expect(build(facts({ snap: snap({ options: { enabled: false } }) })).disabled).toBe(true)
})

test('activity is a row of daily counts per outcome, shadow outcomes and cost kept apart', () => {
  const days = lastDays(NOW, 14, dayOf)
  expect(days.length).toBe(14)
  expect(days[13]).toBe('2026-10-09')
  expect(days[0]).toBe('2026-09-26')
  const v = activityView({
    '2026-10-09': { skills: { asked: 2, 'would-suggest': 1, cost: 0.002 } },
    '2026-10-07': { skills: { asked: 1 }, retired: { did: 5 } },
    '2026-01-01': { skills: { asked: 99 } },
  }, days)
  expect(v.counts.skills?.asked?.[13]).toBe(2)
  expect(v.counts.skills?.asked?.[11]).toBe(1)
  expect(v.counts.skills?.asked?.reduce((a, b) => a + b, 0)).toBe(3)
  expect(v.counts.skills?.['would-suggest']?.[13]).toBe(1)
  expect(v.counts.retired?.did?.[11]).toBe(5)
  expect(v.cost.skills?.[13]).toBe(0.002)
  expect('cost' in (v.counts.skills ?? {})).toBe(false)
})

test('the state never holds a key: the backend part is a name and a source', () => {
  const s = build(facts())
  expect(Object.keys(s.backend ?? {}).sort()).toEqual(['keySource', 'misconfigured', 'model', 'name', 'private', 'provider'])
})

test('server lines: ready, refresh, ops checked against the registry, noise dropped', () => {
  expect(readLine('{"ready":true,"port":40123,"token":"abcdefghijklmnopqrstuvwx","pid":77}', features))
    .toEqual({ kind: 'ready', port: 40123, token: 'abcdefghijklmnopqrstuvwx', pid: 77 })
  expect(readLine('{"ready":true,"port":0,"token":"abcdefghijklmnopqrstuvwx"}', features)).toBe(null)
  expect(readLine('{"ready":true,"port":4000,"token":"short"}', features)).toBe(null)
  expect(readLine('{"op":"refresh"}', features)).toEqual({ kind: 'refresh' })
  expect(readLine('not json', features)).toBe(null)
  expect(readLine('[1]', features)).toBe(null)
  expect(readLine('{"id":"op-1","op":"set","scope":"user","feature":"skills","key":"mode","value":"shadow"}', features))
    .toEqual({ kind: 'op', op: { id: 'op-1', op: 'set', scope: 'user', feature: 'skills', key: 'mode', value: 'shadow' } })
  expect(readLine('{"id":"op-2","op":"set","scope":"project","feature":"later-feature","key":"maxNudges","value":3}', features))
    .toEqual({ kind: 'op', op: { id: 'op-2', op: 'set', scope: 'project', feature: 'later-feature', key: 'maxNudges', value: 3 } })
  expect(readLine('{"id":"op-3","op":"set","scope":"user","feature":"later-feature","key":"maxNudges","value":null}', features))
    .toEqual({ kind: 'op', op: { id: 'op-3', op: 'set', scope: 'user', feature: 'later-feature', key: 'maxNudges', value: null } })
  expect(readLine('{"id":"op-4","op":"reset","scope":"user","feature":"band"}', features))
    .toEqual({ kind: 'op', op: { id: 'op-4', op: 'reset', scope: 'user', feature: 'band' } })
  expect(readLine('{"id":"op-5","op":"set","scope":"global","feature":"skills","key":"mode","value":"on"}', features))
    .toEqual({ kind: 'bad', id: 'op-5', problem: 'scope must be user or project' })
  expect(readLine('{"id":"op-6","op":"set","scope":"user","feature":"nope","key":"mode","value":"on"}', features))
    .toEqual({ kind: 'bad', id: 'op-6', problem: 'no feature nope' })
  expect(readLine('{"id":"op-7","op":"set","scope":"user","feature":"skills","key":"api_key","value":"x"}', features))
    .toEqual({ kind: 'bad', id: 'op-7', problem: 'skills has no setting api_key' })
  expect(readLine('{"id":"op-8","op":"set","scope":"user","feature":"skills","key":"mode","value":{"a":1}}', features)?.kind).toBe('bad')
  expect(readLine('{"id":"op-9","op":"delete","scope":"user","feature":"skills"}', features)?.kind).toBe('bad')
  expect(readLine('{"id":"../x","op":"reset","scope":"user","feature":"skills"}', features)).toBe(null)
})

test('lines across pieces, and answers kept to the newest', () => {
  let got = lines('', '{"a":1}\n{"b"')
  expect(got).toEqual({ lines: ['{"a":1}'], rest: '{"b"' })
  got = lines(got.rest, ':2}\n\n')
  expect(got).toEqual({ lines: ['{"b":2}'], rest: '' })
  expect(lines('', 'x'.repeat(70000)).rest).toBe('')
  let kept = {}
  for (let i = 0; i < 25; i++) kept = remember(kept, `op-${i}`, { ok: true })
  expect(Object.keys(kept).length).toBe(20)
  expect(Object.keys(kept)[19]).toBe('op-24')
})

test('the static page holds the state where no </script> can end it', () => {
  const s = build(facts({ problems: ['</script><script>alert(1)</script>'] }))
  const page = pageWith('<script>const BOOT = /*__BOOT__*/null</script>', `{"mode":"static","state":${embed(s)}}`)
  expect(page.includes('</script><script>alert')).toBe(false)
  expect(page.startsWith('<script>const BOOT = {"mode":"static","state":{')).toBe(true)
  expect(pageWith('a /*__BOOT__*/null b', { mode: 'live' })).toBe('a {"mode":"live"} b')
  expect(pageWith('/*__BOOT__*/null', '$&$1')).toBe('$&$1')
})
