import { log } from '../lib/log'

export type ReportEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: ReportEventKind, payload: unknown) => void)[] = []

export const onReportEvent = (fn: (kind: ReportEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishReportEvent(kind: ReportEventKind, payload: unknown): Promise<void> {
  log.debug('report event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
