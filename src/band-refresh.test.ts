import { test, expect, mock } from 'claude-code/testing'

// The band as a person watches it through a session: drawn once, then redrawn by the mod's own
// writes after each decision, with no restart. Routing is driven with no decision backend: a
// follow-up prompt (empty text, within FOLLOW_UP_MS of the last routed turn) keeps the previous
// lane, so the session's record is seeded with one and the shipped lane table names the model.

const BAND = { plugin: 'jev-mod', component: 'AbovePrompt' as const, props: { hasSurvey: false } as never } // the host fills in the rest

async function setUp($: any, on: any) {
  on('session.id', async () => ({ value: 'band-test' }))
  mock.store(on, { sessions: { 'band-test': { at: Date.now(), features: { routing: { previous: { lane: 'medium', at: Date.now(), corrections: 0 } } } } } })
  on('env.get', async (_$: unknown, e: { name: string }) =>
    ({ value: e.name === 'XDG_CONFIG_HOME' ? '/cfg' : e.name === 'HOME' ? '/home/t' : undefined }))
  // a config that turns routing on (it is off until chosen), which also means the install is configured
  on('fs.read', async (_$: unknown, e: { path: string }) => {
    if (e.path === '/cfg/jev-mod/config.json') return { value: JSON.stringify({ features: { routing: { mode: 'on' } } }) }
    throw new Error('no such file')
  })
  on('fs.list', async () => { throw new Error('no such dir') })
  on('http.fetch', async () => { throw new Error('no network in tests') })
  on('process.run', async () => ({ exitCode: 1, stdout: '', stderr: '' }))
  on('ui.status', async () => ({ value: undefined }))
  on('session.usage', async () => ({ value: { context: { tokens: 1000, window: 200_000, percent: 0.5 } } }))
  on('turn.step', async function* (_$: unknown, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] }
  })
}

/** One step of the main thread, as the engine sends it. */
async function step($: any, turnId: string, index: number, model: string): Promise<void> {
  for await (const _ of $.turn.step({ turnId, index, model, effort: 'medium', messageCount: 1 })) { /* drain */ }
}

const text = async (mounted: { drawn: () => Promise<unknown> }) => {
  const words: string[] = []
  const walk = (node: any): void => { if (typeof node === 'string') words.push(node); else (node?.children ?? []).forEach(walk) }
  walk(await mounted.drawn())
  return words.join('')
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band follows each routed step without a restart, and always names the model (${surface})`, async ($, on) => {
    await setUp($, on)
    const mounted = await $.ui.mount({ ...BAND, surface })
    expect(await text(mounted)).toContain('jev-mod ready')

    // A turn's first step: Claude Code sends opus, the mod routes it to sonnet.
    await step($, 't1', 0, 'claude-opus-5-5')
    expect(await text(mounted)).toContain('normal → sonnet 5.5 · medium')

    // Its later steps arrive already on sonnet: the turn was still routed, and the band says so.
    await step($, 't1', 1, 'claude-sonnet-5-5')
    expect(await text(mounted)).toContain('normal → sonnet 5.5 · medium')

    // A next turn Claude Code already sends on sonnet: kept, and the model is still named.
    await step($, 't2', 0, 'claude-sonnet-5-5')
    const kept = await text(mounted)
    expect(kept).toContain('sonnet 5.5')
    expect(kept).toContain('kept')
  })
}
