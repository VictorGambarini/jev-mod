import { log } from '../lib/log'

export type TicketEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: TicketEventKind, payload: unknown) => void)[] = []

export const onTicketEvent = (fn: (kind: TicketEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishTicketEvent(kind: TicketEventKind, payload: unknown): Promise<void> {
  log.debug('ticket event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
