import { log } from '../lib/log'

export type SupplierEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: SupplierEventKind, payload: unknown) => void)[] = []

export const onSupplierEvent = (fn: (kind: SupplierEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishSupplierEvent(kind: SupplierEventKind, payload: unknown): Promise<void> {
  log.debug('supplier event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
