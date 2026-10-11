// The machine side of the web-filter task bench: the local site and the scratch config folder
// for plain Claude Code. Importing this fills in task.ts's `io`; the bench registry imports it.

import { plainConfig } from '../../../bench/plain'
import { startSite, type Site } from '../../../bench/web-server'
import { FILTER_TASKS, pageHtml } from './pages'
import { io, task } from './task'

let site: Site | null = null
let plain: Awaited<ReturnType<typeof plainConfig>> | null = null

io.start = async () => {
  const pages = Object.fromEntries(FILTER_TASKS.flatMap(t => Object.entries(t.pages).map(([path, spec]) => [path, { body: pageHtml(spec) }])))
  site = await startSite(pages)
  plain = await plainConfig()
  return async () => { await site?.stop(); await plain?.remove(); site = null; plain = null }
}
io.env = arm => ({ ...(site?.env ?? {}), ...(arm.kind === 'claude' ? plain?.env ?? {} : {}) })

export { task }
