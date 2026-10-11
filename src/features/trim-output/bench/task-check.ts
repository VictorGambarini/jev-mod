// trim-output's task checker: it runs the project's tests, build or dry run, which needs processes
// and files, so it lives apart from task.ts (the mod's test environment cannot load bench/node.ts).

import type { Checked } from '../../../bench/types'
import { fs, repoRoot, run } from '../../../bench/node'
import { checkAnswer, counts, taskAdapter, type TrimTask } from './task'

/** Put the original files back over the arm's folder, so a "fix" cannot be an edit of the tests. */
async function restore(root: string, work: string, paths: readonly string[]): Promise<void> {
  const f = await fs()
  for (const p of paths) {
    await f.rm(`${work}/${p}`, { recursive: true, force: true })
    await f.cp(`${root}/${p}`, `${work}/${p}`, { recursive: true })
  }
}

export async function checkWork(t: TrimTask, finalText: string, work: string): Promise<Checked> {
  const c = t.check
  if (c.kind === 'answer') return checkAnswer(c.patterns, finalText)
  await restore(`${repoRoot()}/${t.fixture}`, work, c.restore)
  const ran = await run(c.argv[0]!, c.argv.slice(1), { cwd: work, timeoutMs: 120_000 })
  const out = `${ran.stdout}\n${ran.stderr}`
  const success = ran.code === 0
  const n = c.kind === 'tests' ? counts(out) : null
  const score = success ? 1 : n && n.pass + n.fail > 0 ? n.pass / (n.pass + n.fail) : 0
  return { success, score, detail: { exit: ran.code, ...(n ? { pass: n.pass, fail: n.fail } : {}) } }
}


export const task = taskAdapter(checkWork)
