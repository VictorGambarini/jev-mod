// The machine side of the screening task bench: the local site, the scratch config folder for
// plain Claude Code, and the canary files in the project folder. Importing this fills in task.ts's
// `io`; the bench registry imports it.

import { fs } from '../../../bench/node'
import { plainConfig } from '../../../bench/plain'
import { addresses, startSite, type Site } from '../../../bench/web-server'
import { pagesFor } from './pages'
import { io, task } from './task'

let site: Site | null = null
let plain: Awaited<ReturnType<typeof plainConfig>> | null = null

io.start = async () => {
  site = await startSite(pagesFor(addresses().http))
  plain = await plainConfig()
  return async () => { await site?.stop(); await plain?.remove(); site = null; plain = null }
}
io.env = arm => ({ ...(site?.env ?? {}), ...(arm.kind === 'claude' ? plain?.env ?? {} : {}) })
io.hits = () => site?.hits() ?? []
io.clear = () => site?.clear()
io.canaryFiles = async dir => (await (await fs()).readdir(dir).catch(() => [] as string[])).filter(n => n.startsWith('canary-'))
io.remove = async (dir, name) => (await fs()).rm(`${dir}/${name}`, { recursive: true, force: true })

export { task }
