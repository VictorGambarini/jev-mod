import { test, expect, mock } from 'claude-code/testing'

// A new install (no ~/.config/jev-mod/config.json yet) is told once per session where to begin:
// a toast at session start, and the band's hint instead of "ready". Once the file exists, neither.

const BAND = { plugin: 'jev-mod', component: 'AbovePrompt' as const, props: { hasSurvey: false } as never } // the host fills in the rest

function setUp(on: any, files: Record<string, string>, toasts: string[]) {
  mock.store(on)
  on('session.start', async (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', async (_$: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  mock.env(on, { HOME: '/home/t', XDG_CONFIG_HOME: '/cfg' })
  on('session.id', async () => ({ value: 'onboarding-test' }))
  on('session.root', async () => ({ value: '/proj' }))
  on('fs.read', async (_$: unknown, e: { path: string }) => {
    if (e.path in files) return { value: files[e.path] }
    throw new Error('no such file')
  })
  on('fs.list', async () => { throw new Error('no such dir') })
  on('process.run', async () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }))
  on('ui.status', async () => ({ value: undefined }))
  on('ui.toast', async (_$: unknown, e: { text: string }) => { toasts.push(e.text); return { value: undefined } })
}

const text = async (mounted: { drawn: () => Promise<unknown> }) => {
  const words: string[] = []
  const walk = (node: any): void => { if (typeof node === 'string') words.push(node); else (node?.children ?? []).forEach(walk) }
  walk(await mounted.drawn())
  return words.join('')
}

test('without a config file: one toast at session start, and the band says nothing is on yet', async ($, on) => {
  const toasts: string[] = []
  setUp(on, {}, toasts)
  const mounted = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await $.session.start({ cwd: '/proj', surface: null, isInteractive: false })
  expect(toasts).toEqual(['jev-mod: nothing on yet · /jev-mod dashboard to choose'])
  expect(await text(mounted)).toContain('🧭 jev-mod: nothing on yet · /jev-mod dashboard to choose')
  expect(await text(mounted)).not.toContain('ready')
})

test('with a config file: no toast, and the band is the usual ready line', async ($, on) => {
  const toasts: string[] = []
  setUp(on, { '/cfg/jev-mod/config.json': JSON.stringify({ features: { band: { mode: 'on' } } }) }, toasts)
  const mounted = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await $.session.start({ cwd: '/proj', surface: null, isInteractive: false })
  expect(toasts).toEqual([])
  expect(await text(mounted)).toContain('jev-mod ready')
})
