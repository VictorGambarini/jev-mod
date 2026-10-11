import { query } from '../../lib/db/pool'

// The provider may send the same event more than once; handle each event id once.
export async function firstTimeSeen(eventId: string): Promise<boolean> {
  const rows = await query(`INSERT INTO provider_events (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id`, [eventId])
  return rows.length === 1
}
