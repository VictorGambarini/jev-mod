import { query } from '../../lib/db/pool'

export async function saveAttempt(id: string, attempt: number, status: number | null, retryAt: Date | null) {
  await query(
    `UPDATE webhook_deliveries SET attempt = $2, last_status = $3, retry_at = $4, state = $5 WHERE id = $1`,
    [id, attempt + 1, status, retryAt, retryAt ? 'pending' : status !== null && status < 300 ? 'delivered' : 'failed'])
}
