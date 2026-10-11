// A task case's scratch project, built the same way for every arm and every check script: the
// fixture copied, made a git repository with one commit (when the case asks), its patch applied
// and left uncommitted, then the case's own `prepare`.

import { fs, run } from './node'
import type { TaskCase } from './types'

export async function buildProject(repo: string, c: TaskCase, folder: string): Promise<void> {
  const f = await fs()
  await f.mkdir(folder, { recursive: true })
  if (c.fixture) await f.cp(`${repo}/${c.fixture}`, folder, { recursive: true })
  if (c.git) {
    // a project under git, as a real one is: the session can diff its own changes
    const git = (...args: string[]) => run('git', ['-c', 'user.name=bench', '-c', 'user.email=bench@example.invalid', ...args], { cwd: folder, timeoutMs: 30_000 })
    for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-q', '-m', 'fixture']]) await git(...args)
    if (c.patch) {
      const applied = await git('apply', `${repo}/${c.patch}`)
      if (applied.code !== 0) throw new Error(`${c.id}: ${c.patch} did not apply`)
    }
  }
  if (c.prepare) await c.prepare(folder)
}
