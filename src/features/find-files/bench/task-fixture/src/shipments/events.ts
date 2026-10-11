import { log } from '../lib/log'

export type ShipmentEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: ShipmentEventKind, payload: unknown) => void)[] = []

export const onShipmentEvent = (fn: (kind: ShipmentEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishShipmentEvent(kind: ShipmentEventKind, payload: unknown): Promise<void> {
  log.debug('shipment event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
