import { log } from '../lib/log'

export type SubscriptionEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: SubscriptionEventKind, payload: unknown) => void)[] = []

export const onSubscriptionEvent = (fn: (kind: SubscriptionEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishSubscriptionEvent(kind: SubscriptionEventKind, payload: unknown): Promise<void> {
  log.debug('subscription event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
