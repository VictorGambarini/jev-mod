// Plain Claude Code for every plain arm of a task-level bench, and for a case's shared setup
// (task.ts gives it them all): jev-mod loaded but switched off whole.
// jev-mod reads a kill file, <config folder>/jev-mod/OFF, above every setting, so an arm given a
// scratch XDG_CONFIG_HOME holding one runs with every feature off, the protective ones too (a
// bench overlay may only make a protective feature stricter, never switch it off). The person's
// own config folder is not touched.

import { fs, proc } from './node'

/** A scratch config folder with the kill file in it; `env` is what the arm's Claude calls are given, `remove` deletes it. */
export async function plainConfig(): Promise<{ env: Record<string, string>; remove(): Promise<void> }> {
  const f = await fs()
  const dir = await f.mkdtemp(`${proc.env.TMPDIR || '/tmp'}/jev-mod-bench-plain-`)
  await f.mkdir(`${dir}/jev-mod`, { recursive: true })
  await f.writeFile(`${dir}/jev-mod/OFF`, 'plain Claude Code for a bench arm\n')
  return { env: { XDG_CONFIG_HOME: dir }, remove: () => f.rm(dir, { recursive: true, force: true }) }
}
