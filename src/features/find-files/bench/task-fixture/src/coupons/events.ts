import { log } from '../lib/log'

export type CouponEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: CouponEventKind, payload: unknown) => void)[] = []

export const onCouponEvent = (fn: (kind: CouponEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishCouponEvent(kind: CouponEventKind, payload: unknown): Promise<void> {
  log.debug('coupon event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
