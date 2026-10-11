import { test, expect } from 'claude-code/testing'
import { dropConfidence, ledger, parseOverlay, readOverlay } from './bench-overlay'
import { problems, resolve, snapshot } from './config'
import type { IO } from './io'
import { feature, type Feature } from './registry'

const USER = '/home/u/.config/jev-mod/config.json'
const OVERLAY = '/scratch/overlay.json'

function io(files: Record<string, string>, env: Record<string, string> = { JEV_MOD_BENCH_OVERLAY: OVERLAY }, options: Record<string, unknown> = {}):
  IO & { files: Record<string, string> } {
  return {
    files,
    option: (name: string) => options[name],
    readFile: async (path: string) => { if (path in files) return files[path]; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    env: async (name: string) => env[name], home: async () => '/home/u', projectRoot: async () => '/p',
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
  } as unknown as IO & { files: Record<string, string> }
}

const conf = (features: Record<string, unknown>) => JSON.stringify({ features })
const at = async (files: Record<string, string>, id: string, env?: Record<string, string>, options?: Record<string, unknown>) => {
  const r = resolve(await snapshot(io(files, env, options)), feature(id) as Feature)
  return r
}

test('an overlay sets a plain feature\'s mode and knobs over the user\'s file', async () => {
  const files = { [USER]: conf({ 'trim-output': { mode: 'on', keepThreshold: 0.35 } }),
    [OVERLAY]: conf({ 'trim-output': { mode: 'shadow', keepThreshold: 0.5, minLines: 40 } }) }
  const r = await at(files, 'trim-output')
  expect(`${r.mode} ${r.source}`).toBe('shadow bench overlay')
  expect(r.knobs.keepThreshold).toEqual({ value: 0.5, source: 'bench overlay' })
  expect(r.knobs.minLines).toEqual({ value: 40, source: 'bench overlay' })
})

test('without the variable the overlay file is not read', async () => {
  const files = { [OVERLAY]: conf({ 'trim-output': { mode: 'on' } }) }
  expect((await at(files, 'trim-output', {})).mode).toBe('off')
})

test('a kill file and /config off still win over an overlay', async () => {
  const files = { [OVERLAY]: conf({ 'trim-output': { mode: 'on' } }), '/home/u/.config/jev-mod/TRIM_OUTPUT_OFF': '' }
  expect((await at(files, 'trim-output')).source).toBe('kill file')
  expect((await at({ [OVERLAY]: conf({ 'trim-output': { mode: 'on' } }) }, 'trim-output', undefined, { enabled: false })).source).toBe('/config')
})

test('an overlay never loosens a protective feature, nor sets its knobs', async () => {
  const files = { [USER]: conf({ 'rules-gate': { mode: 'on', minConfidence: 0.8 } }),
    [OVERLAY]: conf({ 'rules-gate': { mode: 'off', minConfidence: 0.99 } }) }
  const r = await at(files, 'rules-gate')
  expect(`${r.mode} ${r.source}`).toBe('on user')
  expect(r.knobs.minConfidence!.value).toBe(0.8)
  // stricter is allowed
  const up = await at({ [OVERLAY]: conf({ 'rules-gate': { mode: 'shadow' } }) }, 'rules-gate')
  expect(`${up.mode} ${up.source}`).toBe('shadow bench overlay')
})

test('an overlay may turn the browser off, and on only for loopback hosts, never its knobs', async () => {
  // on from the overlay: the browse tool then reaches loopback hosts only (browser/index.test.ts)
  const on = await at({ [OVERLAY]: conf({ browser: { mode: 'on', allowAttach: true, maxSteps: 60 } }) }, 'browser')
  expect(`${on.mode} ${on.source}`).toBe('on bench overlay')
  expect(on.knobs.allowAttach!.value).toBe(false)
  expect(on.knobs.maxSteps!.value).toBe(20)
  const files = { [USER]: conf({ browser: { mode: 'on' } }), [OVERLAY]: conf({ browser: { mode: 'off' } }) }
  expect((await at(files, 'browser')).source).toBe('bench overlay')
})

test('an overlay with a key-shaped field is refused whole, and said so', async () => {
  expect('problem' in parseOverlay(JSON.stringify({ features: {}, api_key: 'x' }))).toBe(true)
  expect('problem' in parseOverlay(JSON.stringify({ features: { routing: { mode: 'on', headers: { a: 'b' } } } }))).toBe(true)
  expect('problem' in parseOverlay('not json')).toBe(true)
  const files = { [OVERLAY]: JSON.stringify({ features: { 'trim-output': { mode: 'on' } }, token: 'x' }) }
  expect((await at(files, 'trim-output')).mode).toBe('off')
  expect((problems(await snapshot(io(files)))).some(p => p.includes('bench overlay'))).toBe(true)
})

test('compact.dropConfidence is read within 0.5-0.99, and the ledger gets one file per call', async () => {
  expect(await dropConfidence(io({ [OVERLAY]: JSON.stringify({ compact: { dropConfidence: 0.85 } }) }))).toBe(0.85)
  expect(await dropConfidence(io({ [OVERLAY]: JSON.stringify({ compact: { dropConfidence: 0.2 } }) }))).toBe(undefined)
  expect(await dropConfidence(io({}, {}))).toBe(undefined)
  const files: Record<string, string> = { [OVERLAY]: JSON.stringify({ ledger: '/scratch/ledger/' }) }
  const fake = io(files)
  await ledger(fake, { feature: 'compact', calls: 2, cost: 0.0003, model: 'jev-1.13', error: null })
  const written = Object.keys(fake.files).filter(p => p.startsWith('/scratch/ledger/'))
  expect(written).toHaveLength(1)
  expect(JSON.parse(fake.files[written[0]!]!)).toMatchObject({ feature: 'compact', calls: 2, cost: 0.0003, model: 'jev-1.13' })
  // no ledger named: nothing written, nothing thrown
  await ledger(io({}, {}), { calls: 1, cost: 0, error: null })
  expect((await readOverlay(io({}, {}))).overlay).toBe(undefined)
})
