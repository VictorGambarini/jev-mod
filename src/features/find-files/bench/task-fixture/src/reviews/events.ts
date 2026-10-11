import { log } from '../lib/log'

export type ReviewEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: ReviewEventKind, payload: unknown) => void)[] = []

export const onReviewEvent = (fn: (kind: ReviewEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishReviewEvent(kind: ReviewEventKind, payload: unknown): Promise<void> {
  log.debug('review event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
