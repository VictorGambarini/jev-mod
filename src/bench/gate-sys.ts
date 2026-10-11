// The real `Sys` for the gate task benches (gate-task.ts), and `stage` for the check scripts.
// The task runner imports it; the kit's tests do not, since they cannot start processes.

import { git, install } from './gate-task'
import { fs, proc, run } from './node'
import type { TaskCase } from './types'

install({
  run: (cmd, args, o) => run(cmd, args, { ...(o?.cwd ? { cwd: o.cwd } : {}), timeoutMs: o?.timeoutMs ?? 60_000 }),
  readFile: async path => (await fs()).readFile(path, 'utf8'),
  writeFile: async (path, text) => (await fs()).writeFile(path, text),
  mkdir: async path => { await (await fs()).mkdir(path, { recursive: true }) },
  env: name => proc.env[name],
})

/** A case's scratch project as the runner makes it (fixture copied, one commit, then `prepare`), in a new temp folder. */
export async function stage(repo: string, c: TaskCase): Promise<string> {
  const f = await fs()
  const base = await f.mkdtemp(`${proc.env.TMPDIR || '/tmp'}/jev-mod-gate-check-`)
  const work = `${base}/project`
  await f.mkdir(work, { recursive: true })
  if (c.fixture) await f.cp(`${repo}/${c.fixture}`, work, { recursive: true })
  for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-q', '-m', 'fixture']]) await git(work, ...args)
  if (c.prepare) await c.prepare(work)
  return work
}
