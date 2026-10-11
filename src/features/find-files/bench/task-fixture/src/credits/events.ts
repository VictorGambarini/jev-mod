import { log } from '../lib/log'

export type CreditEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: CreditEventKind, payload: unknown) => void)[] = []

export const onCreditEvent = (fn: (kind: CreditEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishCreditEvent(kind: CreditEventKind, payload: unknown): Promise<void> {
  log.debug('credit event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
