// The machine side of the web-filter task bench: the local site, started for each arm. Importing
// this fills in task.ts's `io`; the bench registry imports it.

import { startSite } from '../../../bench/web-server'
import { FILTER_TASKS, pageHtml } from './pages'
import { io, task } from './task'

io.site = async () => {
  const pages = Object.fromEntries(FILTER_TASKS.flatMap(t => Object.entries(t.pages).map(([path, spec]) => [path, { body: pageHtml(spec) }])))
  const site = await startSite(pages)
  return { env: site.env, stop: () => site.stop() }
}

export { task }
