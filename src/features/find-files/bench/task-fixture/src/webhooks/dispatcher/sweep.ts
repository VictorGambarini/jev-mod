import { query } from '../../lib/db/pool'
import { deliver } from './dispatcher'

// Picks up deliveries whose retry time has come.
export async function sweepDeliveries(): Promise<number> {
  const due = await query<{ id: string; endpoint_url: string; event: string; body: string; attempt: number }>(
    `SELECT id, endpoint_url, event, body, attempt FROM webhook_deliveries WHERE state = 'pending' AND retry_at <= now() LIMIT 200`)
  await Promise.all(due.map(d => deliver({ id: d.id, endpointUrl: d.endpoint_url, event: d.event, body: d.body, attempt: d.attempt })))
  return due.length
}
