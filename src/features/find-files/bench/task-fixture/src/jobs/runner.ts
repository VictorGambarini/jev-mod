import { log } from '../lib/log'

// Runs one named job now, for `npm run job -- <name>` and the admin "run now" button.
export async function runJob(name: string, jobs: Record<string, () => Promise<unknown>>) {
  const job = jobs[name]
  if (!job) throw new Error(`no job called ${name}`)
  const started = Date.now()
  await job()
  log.info('job finished', { name, ms: Date.now() - started })
}
