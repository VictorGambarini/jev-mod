import { log } from '../lib/log'

export type WarehouseEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: WarehouseEventKind, payload: unknown) => void)[] = []

export const onWarehouseEvent = (fn: (kind: WarehouseEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishWarehouseEvent(kind: WarehouseEventKind, payload: unknown): Promise<void> {
  log.debug('warehouse event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
