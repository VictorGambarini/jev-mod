import { test, expect } from 'claude-code/testing'
import type { IO } from '../../core/io'
import { folderFor, KEEP_DAYS, prune } from './files'

const DAY = 24 * 60 * 60_000

function io(env: Record<string, string> = {}, folders: Record<string, number[]> = {}): IO & { ran: string[][] } {
  const ran: string[][] = []
  return {
    ran,
    env: async (name: string) => env[name],
    home: async () => '/home/u',
    sessionId: async () => 'abc/../x y',
    readFile: async () => { throw new Error('ENOENT') },
    folders: async () => Object.keys(folders),
    files: async (path: string) => (folders[path.split('/').pop()!] ?? []).map((mtimeMs, i) => ({ name: `f${i}.txt`, mtimeMs })),
    run: async (argv: string[]) => { ran.push(argv); return { exitCode: 0, stdout: '', stderr: '' } },
  } as unknown as IO & { ran: string[][] }
}

test('files go under the cache folder, one folder per session, its id made safe for a path', async () => {
  expect(await folderFor(io())).toEqual({ root: '/home/u/.cache/jev-mod/compact', dir: '/home/u/.cache/jev-mod/compact/abc_.._x_y', session: 'abc_.._x_y' })
  expect((await folderFor(io({ XDG_CACHE_HOME: '/c' })))!.dir).toBe('/c/jev-mod/compact/abc_.._x_y')
})

test('prune removes other sessions\' folders untouched for KEEP_DAYS, never this one', async () => {
  const now = 1_000 * DAY
  const fake = io({}, { old: [now - (KEEP_DAYS + 1) * DAY], fresh: [now - (KEEP_DAYS + 1) * DAY, now - DAY], mine: [now - 90 * DAY] })
  await prune(fake, '/r', 'mine', now)
  expect(fake.ran).toEqual([['rm', '-rf', '--', '/r/old']])
})
