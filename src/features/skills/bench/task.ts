// The skills feature's task-level bench, on the real machine: the project's files, the checker's
// programs and the session's transcript. The cases and checks are in task-checks.ts.

import { fs, proc, repoRoot, run } from '../../../bench/node'
import { FIXTURE, makeTask, skillsLoaded, transcriptDir, type Work } from './task-checks'

export function workOf(dir: string): Work {
  const root = `${repoRoot()}/${FIXTURE}`
  return {
    dir,
    read: async path => { try { return await (await fs()).readFile(`${dir}/${path}`, 'utf8') } catch { return '' } },
    list: async path => (await fs()).readdir(`${dir}/${path}`).catch(() => [] as string[]),
    exec: async (cmd, args) => { const r = await run(cmd, args, { cwd: dir, timeoutMs: 60_000 }); return { code: r.code, out: r.stdout + r.stderr } },
    original: async path => (await fs()).readFile(`${root}/${path}`, 'utf8'),
    originalList: async path => (await fs()).readdir(`${root}/${path}`),
  }
}

/** The skills a session loaded in this folder, from Claude Code's transcripts of it; null when there are none to read. */
export async function loadedIn(dir: string): Promise<string[] | null> {
  const f = await fs()
  const home = proc.env.CLAUDE_CONFIG_DIR || `${proc.env.HOME ?? ''}/.claude`
  const folder = `${home}/projects/${transcriptDir(dir)}`
  const names = await f.readdir(folder).catch(() => null)
  if (!names) return null
  const out: string[] = []
  for (const n of names.filter(n => n.endsWith('.jsonl'))) out.push(...skillsLoaded(await f.readFile(`${folder}/${n}`, 'utf8').catch(() => '')))
  return out
}

export const task = makeTask({ work: workOf, loaded: loadedIn })
