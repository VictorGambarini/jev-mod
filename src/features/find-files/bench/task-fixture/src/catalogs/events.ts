import { log } from '../lib/log'

export type CatalogEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: CatalogEventKind, payload: unknown) => void)[] = []

export const onCatalogEvent = (fn: (kind: CatalogEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishCatalogEvent(kind: CatalogEventKind, payload: unknown): Promise<void> {
  log.debug('catalog event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
