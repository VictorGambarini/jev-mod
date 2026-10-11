import { log } from '../lib/log'

export type NoteEventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: NoteEventKind, payload: unknown) => void)[] = []

export const onNoteEvent = (fn: (kind: NoteEventKind, payload: unknown) => void) => listeners.push(fn)

export async function publishNoteEvent(kind: NoteEventKind, payload: unknown): Promise<void> {
  log.debug('note event', { kind })
  for (const fn of listeners) fn(kind, payload)
}
