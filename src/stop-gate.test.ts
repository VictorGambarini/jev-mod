import { test, expect } from 'claude-code/testing'

// The completion gate's glue on the settings Stop event: its rules are features/stop-gate/gate.test.ts's.
// These raise Stop as the engine does, with the feature on in the user's file, and check that
// nothing is sent and nothing blocks where nothing may be: no claim, private, or off; and that a
// settings Stop hook that blocks is left to stand. (The path that asks the backend is not run here:
// the kit runs a mod's process calls for real, and key lookup may reach the OS secret store.)

const setUp = (on: any, mode: string, fetched: string[], beneath: Record<string, unknown> = {}) => {
  on('env.get', async (_$: unknown, e: { name: string }) =>
    ({ value: e.name === 'XDG_CONFIG_HOME' ? '/cfg' : e.name === 'HOME' ? '/home/t' : undefined }))
  on('fs.read', async (_$: unknown, e: { path: string }) => {
    if (e.path === '/cfg/jev-mod/config.json') return { value: JSON.stringify({ features: { 'stop-gate': { mode } } }) }
    throw new Error('no such file')
  })
  on('http.fetch', async (_$: unknown, e: { url: string }) => { fetched.push(e.url); throw new Error('no network in tests') })
  on('classic.Stop', async () => beneath) // the settings Stop hooks' answer
}

test('a final message that claims nothing is let through, and nothing is sent', async ($, on) => {
  const fetched: string[] = []
  setUp(on, 'on', fetched)
  const ran = await $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'Which file should I look at first?' })
  expect(ran.block).toBe(undefined)
  expect(fetched).toEqual([])
})

test('private sends nothing and never blocks, even on a claim', { options: { private: true } }, async ($, on) => {
  const fetched: string[] = []
  setUp(on, 'on', fetched)
  const ran = await $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'Done. All tests pass.' })
  expect(ran.block).toBe(undefined)
  expect(fetched).toEqual([])
})

test('off reads nothing of the turn and never blocks', async ($, on) => {
  const fetched: string[] = []
  setUp(on, 'off', fetched)
  const ran = await $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'Done. All tests pass.' })
  expect(ran.block).toBe(undefined)
  expect(fetched).toEqual([])
})

test("a settings Stop hook's own block stands, and the gate adds nothing to it", async ($, on) => {
  const fetched: string[] = []
  setUp(on, 'on', fetched, { block: 'run the linter first' })
  const ran = await $.classic.Stop({ stop_hook_active: false, last_assistant_message: 'Done. All tests pass.' })
  expect(ran.block).toBe('run the linter first')
  expect(fetched).toEqual([])
})
