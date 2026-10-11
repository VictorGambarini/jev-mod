import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Notification, NewNotification } from './model'

export async function findNotification(id: string): Promise<Notification | null> {
  const [row] = await query<Notification>(`SELECT id, recipient_id, channel, sent_at FROM notifications WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchNotifications(limit = 50, offset = 0): Promise<Notification[]> {
  return query<Notification>(`SELECT id, recipient_id, channel, sent_at FROM notifications ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertNotification(input: NewNotification): Promise<Notification> {
  const id = newId('not')
  await withRetry(() => query(`INSERT INTO notifications (id, recipient_id, channel, sent_at) VALUES ($1, $2, $3, $4)`, [id, input.recipientId, input.channel, input.sentAt]))
  return { id, ...input }
}

export async function removeNotification(id: string): Promise<void> {
  await query(`DELETE FROM notifications WHERE id = $1`, [id])
}
