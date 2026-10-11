import { log } from '../lib/log'

export type TeamEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: TeamEventKind, payload: unknown) => void)[] = []

export const onTeamEvent = (fn: (kind: TeamEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishTeamEvent(kind: TeamEventKind, payload: unknown): Promise<void> {
  log.debug('team event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
