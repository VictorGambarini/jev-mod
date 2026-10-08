import { test, expect } from 'claude-code/testing'
import type { IO, RunResult } from '../../core/io'
import { run } from './index'

// A module reload leaves the old copy's server behind: the new copy ends it (and only it) before it starts its own.

const RUN = '/cfg/jev-mod/dashboard/s1'

function io(files: Record<string, string>, ps: string): IO & { ran: string[][] } {
  const ran: string[][] = []
  return {
    ran,
    option: () => undefined,
    readFile: async (path: string) => {
      if (path.endsWith('/page.html')) return '<html><script>const BOOT = /*__BOOT__*/null</script></html>'
      if (path in files) return files[path]
      throw new Error('ENOENT')
    },
    writeFile: async (path: string, text: string) => { files[path] = text },
    folders: async () => [], files: async () => [],
    env: async (name: string) => ({ XDG_CONFIG_HOME: '/cfg', JEV_MOD_DASHBOARD: 'static,no-browser', JEV_HOME: '/jev' } as Record<string, string>)[name],
    home: async () => '/home/u', projectRoot: async () => undefined, pluginRoot: () => '/plugin',
    sessionId: async () => 's1',
    storeGet: async () => undefined, storeSet: async () => {},
    run: async (argv: string[]): Promise<RunResult> => {
      ran.push(argv)
      return argv[0] === 'ps' ? { exitCode: ps ? 0 : 1, stdout: ps, stderr: '' } : { exitCode: 1, stdout: '', stderr: '' }
    },
  } as unknown as IO & { ran: string[][] }
}

test("an earlier copy's server for this session is ended before a new page starts", async () => {
  const files = { [`${RUN}/server.json`]: JSON.stringify({ pid: 4242, port: 5000 }) }
  const fake = io(files, `node /plugin/src/features/dashboard/server.mjs ${RUN}/state.json /plugin/src/features/dashboard/page.html\n`)
  await run(fake, 'open')
  expect(fake.ran).toContainEqual(['kill', '4242'])
  expect(files[`${RUN}/server.json`]).toBe('{}')
})

test('a pid the system gave to something else is left alone', async () => {
  const files = { [`${RUN}/server.json`]: JSON.stringify({ pid: 4242, port: 5000 }) }
  const fake = io(files, '/usr/bin/vim notes.txt\n')
  await run(fake, 'open')
  expect(fake.ran.some(argv => argv[0] === 'kill')).toBe(false)
})
