import { log } from '../lib/log'

export type TagEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: TagEventKind, payload: unknown) => void)[] = []

export const onTagEvent = (fn: (kind: TagEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishTagEvent(kind: TagEventKind, payload: unknown): Promise<void> {
  log.debug('tag event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
