import { log } from '../lib/log'

export type NotificationEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: NotificationEventKind, payload: unknown) => void)[] = []

export const onNotificationEvent = (fn: (kind: NotificationEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishNotificationEvent(kind: NotificationEventKind, payload: unknown): Promise<void> {
  log.debug('notification event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
