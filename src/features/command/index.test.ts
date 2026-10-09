import { test, expect } from 'claude-code/testing'
import type { IO } from '../../core/io'
import { apply } from '../dashboard'
import { run } from './index'

// Both ways of writing a setting, /jev-mod and the dashboard, go through config.write, so both
// refuse a project file that would loosen a protective feature, with the same words.

function io(files: Record<string, string>): IO {
  return {
    option: () => undefined,
    readFile: async (path: string) => { if (path in files) return files[path]; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    env: async () => undefined, home: async () => '/home/u', projectRoot: async () => '/p',
    run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
  } as unknown as IO
}

test('/jev-mod and the dashboard refuse to lower a protective feature in the project file', async () => {
  const files: Record<string, string> = {}
  const fake = io(files)
  files['/home/u/.config/jev-mod/config.json'] = JSON.stringify({ features: { 'tool-gate': { mode: 'shadow' } } })
  const said = await run(fake, 'tool-gate off --project')
  expect(said.text).toBe('project config may not lower tool-gate: off is looser than shadow (user), and a project may only make it stricter')
  expect(await apply(fake, { id: 'op-1', op: 'set', scope: 'project', feature: 'screening', key: 'mode', value: 'shadow' })).toEqual({
    ok: false, error: 'project config may not lower screening: shadow is looser than on (default), and a project may only make it stricter' })
  expect(await apply(fake, { id: 'op-2', op: 'set', scope: 'project', feature: 'stop-gate', key: 'maxNudges', value: 5 })).toEqual({
    ok: false, error: 'project config may not set stop-gate.maxNudges: stop-gate guards you, so only your own file sets its settings' })
  expect('/p/.claude/jev-mod.json' in files).toBe(false)
  expect((await run(fake, 'tool-gate on --project')).text).toContain('tool-gate is on (from the project file)')
  expect((await run(fake, 'tool-gate off')).text).toContain('warning: the project file still decides it')
})
