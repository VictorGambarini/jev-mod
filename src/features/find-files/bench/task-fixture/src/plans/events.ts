import { log } from '../lib/log'

export type PlanEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: PlanEventKind, payload: unknown) => void)[] = []

export const onPlanEvent = (fn: (kind: PlanEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishPlanEvent(kind: PlanEventKind, payload: unknown): Promise<void> {
  log.debug('plan event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
