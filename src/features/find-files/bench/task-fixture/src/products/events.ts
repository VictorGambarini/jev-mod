import { log } from '../lib/log'

export type ProductEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: ProductEventKind, payload: unknown) => void)[] = []

export const onProductEvent = (fn: (kind: ProductEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishProductEvent(kind: ProductEventKind, payload: unknown): Promise<void> {
  log.debug('product event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
