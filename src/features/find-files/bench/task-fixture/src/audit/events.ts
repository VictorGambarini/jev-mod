import { log } from '../lib/log'

export type AuditEntryEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: AuditEntryEventKind, payload: unknown) => void)[] = []

export const onAuditEntryEvent = (fn: (kind: AuditEntryEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishAuditEntryEvent(kind: AuditEntryEventKind, payload: unknown): Promise<void> {
  log.debug('audit entry event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
