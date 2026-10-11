// The real `Sys` for the gate task benches (gate-task.ts), and `stage` for the check scripts.
// The task runner imports it; the kit's tests do not, since they cannot start processes.

import { install } from './gate-task'
import { fs, proc, run } from './node'
import { buildProject } from './project'
import type { TaskCase } from './types'

install({
  run: (cmd, args, o) => run(cmd, args, { ...(o?.cwd ? { cwd: o.cwd } : {}), timeoutMs: o?.timeoutMs ?? 60_000 }),
  readFile: async path => (await fs()).readFile(path, 'utf8'),
  writeFile: async (path, text) => (await fs()).writeFile(path, text),
  mkdir: async path => { await (await fs()).mkdir(path, { recursive: true }) },
  env: name => proc.env[name],
})

/** A case's scratch project as the runner makes it (project.ts: fixture, one commit, then `prepare`), in a new temp folder. */
export async function stage(repo: string, c: TaskCase): Promise<string> {
  const base = await (await fs()).mkdtemp(`${proc.env.TMPDIR || '/tmp'}/jev-mod-gate-check-`)
  const work = `${base}/project`
  await buildProject(repo, { ...c, git: true }, work)
  return work
}
