import { log } from '../lib/log'

export type CustomerEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: CustomerEventKind, payload: unknown) => void)[] = []

export const onCustomerEvent = (fn: (kind: CustomerEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishCustomerEvent(kind: CustomerEventKind, payload: unknown): Promise<void> {
  log.debug('customer event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
