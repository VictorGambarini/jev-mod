import { log } from '../lib/log'

export type AddressEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: AddressEventKind, payload: unknown) => void)[] = []

export const onAddressEvent = (fn: (kind: AddressEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishAddressEvent(kind: AddressEventKind, payload: unknown): Promise<void> {
  log.debug('address event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
