import { test, expect } from 'claude-code/testing'
import { BARE, overlayOf } from '../features/browser/bench/tasks'
import { task as compactTask } from '../features/compact/bench/task'
import { parseOverlay } from '../core/bench-overlay'
import { resolve, snapshot } from '../core/config'
import type { IO } from '../core/io'
import { FEATURES, feature, type Feature } from '../core/registry'
import { configDir } from '../engine/keys'
import { BARE_STRAY, bareLayout, personJevDir, strayFeatures } from './bare'
import { armsFor, overlayFor } from './plan'
import { markdown, summarise } from './summary'
import type { DecisionAdapter, Row, TaskAdapter } from './types'

// The bare arm: the browser alone, against Playwright MCP. Its scratch config folder is built in
// memory here (bareLayout); plain.ts writes the same files to disk.

const SCRATCH = '/scratch/bare'
const OVERLAY = '/scratch/overlay.json'

/** A session whose config folder is `xdg`, with these files, and the bench overlay when one is named. */
function io(files: Record<string, string>, env: Record<string, string>): IO {
  return {
    option: () => undefined,
    readFile: async (path: string) => { if (path in files) return files[path]; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    env: async (name: string) => env[name], home: async () => '/home/u', projectRoot: async () => '/p',
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
  } as unknown as IO
}

const inScratch = (layout: { files: Record<string, string> }) =>
  Object.fromEntries(Object.entries(layout.files).map(([path, text]) => [`${SCRATCH}/${path}`, text]))

// the browser bench's arms come from its adapter's bare and overlay (task.ts imports the machine, so a test cannot)
const browserTask = { feature: 'browser', bare: BARE, overlay: overlayOf } as unknown as TaskAdapter
const [, bareArm] = armsFor(browserTask, ['openrouter'], null, {})

test('the browser bench runs two arms, plain Claude Code and bare browse, and the bare one says so in its id', () => {
  const arms = armsFor(browserTask, ['openrouter'], null, {})
  expect(arms.map(a => a.id)).toEqual(['claude', 'jev-mod openrouter bare screenPages=false'])
  expect(arms[1]).toEqual({ id: 'jev-mod openrouter bare screenPages=false', kind: 'jev-mod', backend: 'openrouter',
    settings: { screenPages: false }, bare: true })
  // a setting given with --set is in the id and in the scratch config
  const set = armsFor(browserTask, ['openrouter'], null, { confirmConfidence: 0.6 })[1]!
  expect(set.id).toBe('jev-mod openrouter bare screenPages=false confirmConfidence=0.6')
  expect(JSON.parse(bareLayout('browser', set.settings, {}).files['jev-mod/config.json']!))
    .toEqual({ features: { browser: { screenPages: false, confirmConfidence: 0.6 } } })
  // a bench that does not run bare keeps its arms as they were
  expect(armsFor(compactTask, ['openrouter'], null, {}).some(a => a.bare || / bare/.test(a.id))).toBe(false)
})

test('the bare arm: the browser on (loopback only, through the overlay), screenPages false, every other feature off, the protective ones too', async () => {
  const layout = bareLayout('browser', bareArm!.settings, { HOME: '/home/u' })
  const overlay = JSON.stringify(overlayFor(browserTask, bareArm!, '/scratch/ledger'))
  const snap = await snapshot(io({ ...inScratch(layout), [OVERLAY]: overlay }, { XDG_CONFIG_HOME: SCRATCH, JEV_MOD_BENCH_OVERLAY: OVERLAY }))
  const browser = resolve(snap, feature('browser') as Feature)
  // 'bench overlay' is what keeps it to loopback hosts and lets screenPages act (browser/index.ts)
  expect(`${browser.mode} ${browser.source}`).toBe('on bench overlay')
  expect(browser.knobs.screenPages).toEqual({ value: false, source: 'user' })
  expect(browser.knobs.confirmConfidence).toEqual({ value: 0.5, source: 'default' }) // the other settings as shipped
  for (const f of FEATURES.filter(x => x.id !== 'browser')) expect(`${f.id} ${resolve(snap, f).mode} ${resolve(snap, f).source}`).toBe(`${f.id} off kill file`)
  expect(FEATURES.filter(f => f.protective).length).toBeGreaterThan(3)
  // a bad setting fails before the arm runs, never falls back to a default
  expect(() => bareLayout('browser', { confirmConfidence: 2 }, {})).toThrow('confirmConfidence')
})

test('the bare arm reaches the decision backend where the person\'s sessions do: its jev folder is a link to theirs, never a copy', async () => {
  for (const env of [{ HOME: '/home/u' }, { HOME: '/home/u', XDG_CONFIG_HOME: '/home/u/xdg' }]) {
    const layout = bareLayout('browser', { screenPages: false }, env)
    // the key file and backends.json are looked up under <XDG_CONFIG_HOME>/jev: the scratch one is the link
    expect(await configDir({ env: async n => ({ XDG_CONFIG_HOME: SCRATCH } as Record<string, string>)[n], home: async () => '/home/u',
      readFile: async () => undefined, secret: async () => undefined })).toBe(`${SCRATCH}/jev`)
    const theirs = await configDir({ env: async n => (env as Record<string, string>)[n], home: async () => env.HOME,
      readFile: async () => undefined, secret: async () => undefined })
    expect(layout.links).toEqual({ jev: theirs })
    expect(personJevDir(env)).toBe(theirs)
    // nothing of the jev folder is written: the layout holds jev-mod's own files only
    expect(Object.keys(layout.files).every(p => p.startsWith('jev-mod/'))).toBe(true)
  }
  expect(bareLayout('browser', {}, {}).links).toEqual({})
})

test('a normal session\'s overlay still cannot switch off a protective feature, nor the browser\'s page screening', async () => {
  const user = '/home/u/.config/jev-mod/config.json'
  const files = {
    [user]: JSON.stringify({ features: { 'stop-gate': { mode: 'on' }, browser: { mode: 'on' } } }),
    [OVERLAY]: JSON.stringify({ features: { screening: { mode: 'off' }, 'stop-gate': { mode: 'off' }, 'rules-gate': { mode: 'off' },
      browser: { mode: 'on', screenPages: false } } }),
  }
  expect('overlay' in parseOverlay(files[OVERLAY]!)).toBe(true)
  const snap = await snapshot(io(files, { JEV_MOD_BENCH_OVERLAY: OVERLAY }))
  expect(resolve(snap, feature('screening') as Feature).mode).toBe('on')
  expect(resolve(snap, feature('stop-gate') as Feature).mode).toBe('on')
  // an overlay sets no knob of a risky feature: screenPages stays as shipped
  expect(resolve(snap, feature('browser') as Feature).knobs.screenPages).toEqual({ value: true, source: 'default' })
  // nor may a project's file set it
  const project = { '/p/.claude/jev-mod.json': JSON.stringify({ features: { browser: { screenPages: false } } }), [user]: files[user]! }
  expect(resolve(await snapshot(io(project, {})), feature('browser') as Feature).knobs.screenPages?.value).toBe(true)
})

test('a bare row with another feature\'s decision is an error: which features strayed', () => {
  expect(BARE_STRAY).toBe('other_decisions_in_bare_arm')
  const spend = (requests: number) => ({ requests, calls: requests, cost_usd: 0 })
  expect(strayFeatures({}, 'browser')).toEqual([])
  expect(strayFeatures({ browser: spend(12) }, 'browser')).toEqual([])
  expect(strayFeatures({ browser: spend(12), screening: spend(1), 'stop-gate': spend(2) }, 'browser')).toEqual(['screening', 'stop-gate'])
  expect(strayFeatures({ browser: spend(3), other: spend(1) }, 'browser')).toEqual(['other']) // an entry naming no feature is not the browser's
  expect(strayFeatures({ browser: spend(3), screening: spend(0) }, 'browser')).toEqual([])
})

test('the report reads a bare arm as the jev-mod arm and says it is not jev-mod as shipped', () => {
  const adapter = { feature: 'browser', title: 'Browser', threshold: { name: 'none', default: 0 } } as unknown as DecisionAdapter
  const row = (arm: string, cost: number): Row => ({ schema: 1, run: 'r', feature: 'browser', level: 'task', jevmod: '0.13.1', git: 'g', date: 'd',
    backend: arm === 'claude' ? { name: 'claude code', kind: 'baseline', model: null } : { name: 'openrouter', kind: 'provider', model: null },
    answered_model: null, settings: {}, sweep: null, case: 'c', arm, outcome: 'ok', success: true, score: 1, items: [], calls: 0, latencies_ms: [],
    input_tokens: null, cost_usd: cost, wall_ms: 1000, claude_cost_usd: 0.1 })
  const s = summarise(adapter, [row('claude', 0), row(bareArm!.id, 0.001)], false)
  expect(s.arms.map(a => `${a.kind} ${a.key}`)).toEqual(['plain claude', 'jev-mod jev-mod openrouter bare screenPages=false'])
  const md = markdown(adapter, s, {})
  expect(md).toContain('| jev-mod openrouter bare screenPages=false |')
  expect(md).toContain('an arm named `bare` runs browser alone')
  expect(md).toContain('not jev-mod as shipped')
})
