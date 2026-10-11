import { log } from '../lib/log'

export type ReturnRequestEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: ReturnRequestEventKind, payload: unknown) => void)[] = []

export const onReturnRequestEvent = (fn: (kind: ReturnRequestEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishReturnRequestEvent(kind: ReturnRequestEventKind, payload: unknown): Promise<void> {
  log.debug('return request event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
