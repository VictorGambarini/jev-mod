import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishNotificationEvent } from './events'
import type { Notification, NewNotification } from './model'
import { fetchNotifications, findNotification, insertNotification, removeNotification } from './repo'
import { validateNotification } from './validators'
// Email sends are not retried here; the mail provider retries for 24 hours on its own.

export async function getNotification(id: string): Promise<Notification> {
  const found = await findNotification(id)
  if (!found) throw notFound('notification')
  return found
}

export async function listNotifications(options: { limit?: number; offset?: number } = {}): Promise<Notification[]> {
  return fetchNotifications(options.limit, options.offset)
}

export async function createNotification(input: NewNotification): Promise<Notification> {
  validateNotification(input)
  const created = await insertNotification(input)
  log.info('notification created', { id: created.id })
  await publishNotificationEvent('created', created)
  return created
}

export async function deleteNotification(id: string): Promise<void> {
  await getNotification(id)
  await removeNotification(id)
  await publishNotificationEvent('deleted', { id })
}
