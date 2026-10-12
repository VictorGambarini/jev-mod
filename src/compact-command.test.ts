import { test, expect, mock } from 'claude-code/testing'

// /jev-mod compact through the engine. The host refuses a compaction from a command's own hook,
// so the command queues /compact with a marker from a timer; a headless `claude -p` ends before
// that timer fires, so there `/compact <marker>` is the way, and the mod answers that compaction
// whether or not the command queued it. The session is empty here, so the mod's compaction ends at
// "nothing to judge" and nothing is sent anywhere.

const MARK = '[jev-mod compact: drop only what Jev marks drop]'

const setUp = (on: any, summarised: string[], fetched: string[], queued: string[]) => {
  on('env.get', async (_$: unknown, e: { name: string }) =>
    ({ value: e.name === 'XDG_CONFIG_HOME' ? '/cfg' : e.name === 'HOME' ? '/home/t' : undefined }))
  on('fs.read', async () => { throw new Error('no such file') })
  on('http.fetch', async (_$: unknown, e: { url: string }) => { fetched.push(e.url); throw new Error('no network in tests') })
  // beneath the mod: the built-in /compact a timer queues, and the summariser a compaction the mod passes on reaches
  on('command.run', { command: 'compact' }, async (_$: unknown, e: { args: string }) => { queued.push(e.args); return { text: 'queued' } })
  on('session.compact', async (_$: unknown, e: { instructions?: string }) => { summarised.push(e.instructions ?? ''); return { skip: 'summariser' } })
}

test('interactive: the command answers at once and queues /compact with the marker from a timer', { timeoutMs: 15000 }, async ($, on) => {
  const summarised: string[] = [], fetched: string[] = [], queued: string[] = []
  setUp(on, summarised, fetched, queued)
  const clock = mock.clock(on)
  const ran = await $.command.run({ command: 'jev-mod', args: 'compact', origin: { kind: 'composer' } } as never)
  expect(ran.text).toBe('jev-mod compact: asking Jev what to drop and how far to trim old tool results; nothing will be summarised.')
  expect(queued).toEqual([])
  await clock.advance(10)
  expect(queued).toEqual([MARK])
  expect(fetched).toEqual([])
})

test('headless: the command says a -p run ends first and names /compact with the marker', { timeoutMs: 15000 }, async ($, on) => {
  const summarised: string[] = [], fetched: string[] = [], queued: string[] = []
  setUp(on, summarised, fetched, queued)
  mock.clock(on)
  const ran = await $.command.run({ command: 'jev-mod', args: 'compact', origin: { kind: 'sdk' } } as never)
  expect(ran.text).toContain(`run \`/compact ${MARK}\` instead`)
})

test('/compact with the marker is the mod\'s compaction, with nothing queued: the summariser never runs', { timeoutMs: 15000 }, async ($, on) => {
  const summarised: string[] = [], fetched: string[] = [], queued: string[] = []
  setUp(on, summarised, fetched, queued)
  const done = await $.session.compact({ trigger: 'manual', instructions: MARK, messages: [] } as never)
  expect(done).toEqual({ skip: 'nothing to judge' })
  expect(summarised).toEqual([])
  expect(fetched).toEqual([])
})

test('an automatic compaction, or /compact without the marker, goes to the summariser untouched', { timeoutMs: 15000 }, async ($, on) => {
  const summarised: string[] = [], fetched: string[] = [], queued: string[] = []
  setUp(on, summarised, fetched, queued)
  await $.session.compact({ trigger: 'auto', instructions: MARK, messages: [] } as never)
  await $.session.compact({ trigger: 'manual', instructions: 'keep the plan', messages: [] } as never)
  expect(summarised).toEqual([MARK, 'keep the plan'])
})
