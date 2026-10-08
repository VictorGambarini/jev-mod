import { test, expect } from 'claude-code/testing'

// The band reads the mod's state, which only its own hooks write; with nothing recorded yet it
// must hand the engine's own band back untouched, on every surface. Its segments are line.test.ts's.
for (const surface of ['terminal', 'desktop'] as const) {
  test(`with nothing recorded the band leaves the engine's own (${surface})`, async ($, on) => {
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine band'] }))
    const mounted = await $.ui.mount({ plugin: 'jev-mod', surface, component: 'AbovePrompt', props: { hasSurvey: false } as never }) // the host fills in the rest of the band's props
    expect(JSON.stringify(await mounted.drawn())).toContain('engine band')
  })
}
