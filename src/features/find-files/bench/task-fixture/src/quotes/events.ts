import { log } from '../lib/log'

export type QuoteEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: QuoteEventKind, payload: unknown) => void)[] = []

export const onQuoteEvent = (fn: (kind: QuoteEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishQuoteEvent(kind: QuoteEventKind, payload: unknown): Promise<void> {
  log.debug('quote event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
