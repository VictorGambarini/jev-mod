// The machine side of the screening task bench: the local site, started for each arm, and the
// canary files in the arm's project. Importing this fills in task.ts's `io`; the bench registry imports it.

import { fs } from '../../../bench/node'
import { addresses, startSite, type Site } from '../../../bench/web-server'
import { pagesFor } from './pages'
import { io, mcpArgs, task } from './task'

let site: Site | null = null

io.site = async workdir => {
  const mine = await startSite(pagesFor(addresses().http))
  site = mine
  return { env: { ...mine.env, JEV_BENCH_SITE: addresses().http }, claudeArgs: mcpArgs(workdir),
    stop: async () => { await mine.stop(); if (site === mine) site = null } }
}
io.hits = () => site?.hits() ?? []
io.read = async (dir, name) => (await fs()).readFile(`${dir}/${name}`, 'utf8').catch(() => '')
io.canaryFiles = async dir => (await (await fs()).readdir(dir).catch(() => [] as string[])).filter(n => n.startsWith('canary-'))

export { task }
