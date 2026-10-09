import { test, expect } from 'claude-code/testing'
import type { IO } from '../../core/io'
import { install, launchChild, PLAYWRIGHT_VERSION } from './child'

// The install command and the not-installed answer, with a fake IO: what is run, where, with
// which environment. Nothing is downloaded.

function io(files: Record<string, string>, fail?: string): IO & { ran: { argv: string[]; init?: any }[] } {
  const ran: { argv: string[]; init?: any }[] = []
  return {
    ran,
    env: async (name: string) => ({ XDG_CACHE_HOME: '/cache' } as Record<string, string>)[name],
    home: async () => '/home/u',
    readFile: async (path: string) => { if (path in files) return files[path]!; throw new Error('ENOENT') },
    writeFile: async (path: string, text: string) => { files[path] = text },
    folders: async () => [],
    status: () => {},
    pluginRoot: () => '/plugin',
    run: async (argv: string[], init?: any) => {
      ran.push({ argv, init })
      if (fail && argv.join(' ').includes(fail)) return { exitCode: 1, stdout: '', stderr: 'boom\nnetwork down' }
      return { exitCode: 0, stdout: '10.0.0', stderr: '' }
    },
  } as unknown as IO & { ran: { argv: string[]; init?: any }[] }
}

test('install: the pinned Playwright, then Chromium into the same folder; nothing else', async () => {
  const files: Record<string, string> = {}
  const fake = io(files)
  const { text } = await install(fake)
  expect(fake.ran.map(r => r.argv.join(' '))).toEqual([
    'npm --version',
    `npm install --no-audit --no-fund --save-exact playwright@${PLAYWRIGHT_VERSION}`,
    'npx --no-install playwright install chromium',
  ])
  expect(fake.ran.slice(1).every(r => r.init.cwd === '/cache/jev-mod/browser')).toBe(true)
  expect(fake.ran[2]!.init.env).toEqual({ PLAYWRIGHT_BROWSERS_PATH: '/cache/jev-mod/browser/ms-playwright' })
  expect(JSON.parse(files['/cache/jev-mod/browser/package.json']!).private).toBe(true)
  expect(text).toContain(`installed Playwright ${PLAYWRIGHT_VERSION} in /cache/jev-mod/browser`)
  expect(text).toContain('To remove it: delete /cache/jev-mod/browser')
})

test('install: an npm failure says so; an installed copy is not installed again', async () => {
  const failed = await install(io({}, 'npm install'))
  expect(failed.text).toContain('failed')
  expect(failed.text).toContain('network down')
  const have = io({ '/cache/jev-mod/browser/node_modules/playwright/package.json': JSON.stringify({ version: PLAYWRIGHT_VERSION }) })
  const again = await install(have)
  expect(have.ran.map(r => r.argv[1])).toEqual(['--version', '--no-install'])
  expect(again.text).toContain('was already in')
})

test('a browse with nothing installed starts nothing and names the command', async () => {
  const fake = io({})
  const got = await launchChild(fake, { startUrl: 'https://x.test/', hosts: ['x.test'], headed: false, cdp: null, values: {}, textChars: 6000, maxRows: 80 })
  expect('status' in got && got.status).toBe('not_installed')
  expect('reason' in got && got.reason).toContain('/jev-mod browser install')
  expect(fake.ran).toEqual([])
})

test('install: the folder is made before npm is probed, the probe has no cwd, and a failed probe says why', async () => {
  const files: Record<string, string> = {}
  const fake = io(files)
  const order: string[] = []
  const write = fake.writeFile
  fake.writeFile = async (path: string, text: string) => { order.push(`write ${path}`); return write(path, text) }
  const run = fake.run
  fake.run = async (argv: string[], init?: any) => { order.push(argv.join(' ')); return run(argv, init) }
  await install(fake)
  expect(order.slice(0, 2)).toEqual(['write /cache/jev-mod/browser/package.json', 'npm --version'])
  expect(fake.ran[0]!.init?.cwd).toBe(undefined)

  const thrown = io({})
  thrown.run = async () => { throw new Error('spawn npm ENOENT') }
  const said = await install(thrown)
  expect(said.text).toContain('npm --version failed (spawn npm ENOENT)')
  const exited = await install(io({}, 'npm --version'))
  expect(exited.text).toContain('npm --version failed (boom\nnetwork down)')
})

test('a browse with no node or bun says what could not be started', async () => {
  const fake = io({ '/cache/jev-mod/browser/node_modules/playwright/package.json': JSON.stringify({ version: PLAYWRIGHT_VERSION }) })
  fake.run = async (argv: string[]) => { throw new Error(`spawn ${argv[0]} ENOENT`) }
  const got = await launchChild(fake, { startUrl: 'https://x.test/', hosts: ['x.test'], headed: false, cdp: null, values: {}, textChars: 6000, maxRows: 80 })
  expect('status' in got && got.status).toBe('failed')
  const reason = 'reason' in got ? got.reason : ''
  expect(reason).toContain('node could not be run: spawn node ENOENT')
  expect(reason).toContain('bun could not be run: spawn bun ENOENT')
})
