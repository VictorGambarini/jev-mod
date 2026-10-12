// Plain Claude Code for every plain arm of a task-level bench, and for a case's shared setup
// (task.ts gives it them all): jev-mod loaded but switched off whole.
// jev-mod reads a kill file, <config folder>/jev-mod/OFF, above every setting, so an arm given a
// scratch XDG_CONFIG_HOME holding one runs with every feature off, the protective ones too (a
// bench overlay may only make a protective feature stricter, never switch it off). The person's
// own config folder is not touched. A bare jev-mod arm gets a scratch config folder too
// (bareConfig; what it holds and why is bare.ts's).

import { bareLayout } from './bare'
import { fs, proc } from './node'
import type { Setting } from './types'

/** A scratch config folder with the kill file in it; `env` is what the arm's Claude calls are given, `remove` deletes it. */
export async function plainConfig(): Promise<{ env: Record<string, string>; remove(): Promise<void> }> {
  const f = await fs()
  const dir = await f.mkdtemp(`${proc.env.TMPDIR || '/tmp'}/jev-mod-bench-plain-`)
  await f.mkdir(`${dir}/jev-mod`, { recursive: true })
  await f.writeFile(`${dir}/jev-mod/OFF`, 'plain Claude Code for a bench arm\n')
  return { env: { XDG_CONFIG_HOME: dir }, remove: () => f.rm(dir, { recursive: true, force: true }) }
}

/**
 * A bare arm's scratch config folder (bare.ts): `env` is what the arm's Claude calls are given,
 * `remove` deletes the folder and the link in it, never what the link points to.
 */
export async function bareConfig(id: string, settings: Record<string, Setting>, env: Record<string, string | undefined> = proc.env):
  Promise<{ dir: string; env: Record<string, string>; remove(): Promise<void> }> {
  const layout = bareLayout(id, settings, env)
  const f = await fs()
  const dir = await f.mkdtemp(`${env.TMPDIR || '/tmp'}/jev-mod-bench-bare-`)
  await f.mkdir(`${dir}/jev-mod`, { recursive: true })
  for (const [path, text] of Object.entries(layout.files)) await f.writeFile(`${dir}/${path}`, text)
  for (const [path, target] of Object.entries(layout.links)) await f.symlink(target, `${dir}/${path}`)
  return { dir, env: { XDG_CONFIG_HOME: dir }, remove: () => f.rm(dir, { recursive: true, force: true }) }
}
