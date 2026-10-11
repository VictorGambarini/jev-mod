import { log } from '../lib/log'

export type OrderEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: OrderEventKind, payload: unknown) => void)[] = []

export const onOrderEvent = (fn: (kind: OrderEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishOrderEvent(kind: OrderEventKind, payload: unknown): Promise<void> {
  log.debug('order event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
