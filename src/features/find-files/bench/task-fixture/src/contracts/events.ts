import { log } from '../lib/log'

export type ContractEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: ContractEventKind, payload: unknown) => void)[] = []

export const onContractEvent = (fn: (kind: ContractEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishContractEvent(kind: ContractEventKind, payload: unknown): Promise<void> {
  log.debug('contract event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
