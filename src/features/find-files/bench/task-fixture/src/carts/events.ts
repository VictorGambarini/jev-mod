import { log } from '../lib/log'

export type CartEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: CartEventKind, payload: unknown) => void)[] = []

export const onCartEvent = (fn: (kind: CartEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishCartEvent(kind: CartEventKind, payload: unknown): Promise<void> {
  log.debug('cart event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
