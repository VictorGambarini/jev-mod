import cron from 'node-cron'
import { runDunning } from '../billing/dunning/run-dunning'
import { expireStaleKeys } from '../admin/apikeys/expire-stale'
import { sweepDeliveries } from '../webhooks/dispatcher/sweep'
import { log } from '../lib/log'

// Every scheduled job in the app, in one place. Times are UTC.
export function startSchedules() {
  const every = (name: string, expr: string, fn: () => Promise<unknown>) =>
    cron.schedule(expr, () => fn().catch(error => log.error(`job ${name} failed`, { error: String(error) })), { timezone: 'UTC' })

  every('dunning', '0 2 * * *', () => runDunning())
  every('expire-api-keys', '15 3 * * *', () => expireStaleKeys())
  every('webhook-sweep', '*/5 * * * *', () => sweepDeliveries())
}
