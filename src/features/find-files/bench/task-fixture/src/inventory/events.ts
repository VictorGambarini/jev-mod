import { log } from '../lib/log'

export type InventoryItemEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: InventoryItemEventKind, payload: unknown) => void)[] = []

export const onInventoryItemEvent = (fn: (kind: InventoryItemEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishInventoryItemEvent(kind: InventoryItemEventKind, payload: unknown): Promise<void> {
  log.debug('inventory item event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
