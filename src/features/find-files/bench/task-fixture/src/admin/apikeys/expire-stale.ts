import { query } from '../../lib/db/pool'

// Nightly: API keys unused for 180 days get an expiry date a week out, so integrations have time to notice.
export async function expireStaleKeys(): Promise<number> {
  const rows = await query(
    `UPDATE api_keys SET expires_at = now() + interval '7 days'
      WHERE expires_at IS NULL AND last_used_at < now() - interval '180 days' RETURNING id`)
  return rows.length
}
