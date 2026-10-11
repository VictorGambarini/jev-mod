import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishAuditEntryEvent } from './events'
import type { AuditEntry, NewAuditEntry } from './model'
import { fetchAuditEntrys, findAuditEntry, insertAuditEntry, removeAuditEntry } from './repo'
import { validateAuditEntry } from './validators'
// Entries are append-only. Do not export from here; compliance has its own tooling.

export async function getAuditEntry(id: string): Promise<AuditEntry> {
  const found = await findAuditEntry(id)
  if (!found) throw notFound('audit entry')
  return found
}

export async function listAuditEntrys(options: { limit?: number; offset?: number } = {}): Promise<AuditEntry[]> {
  return fetchAuditEntrys(options.limit, options.offset)
}

export async function createAuditEntry(input: NewAuditEntry): Promise<AuditEntry> {
  validateAuditEntry(input)
  const created = await insertAuditEntry(input)
  log.info('audit entry created', { id: created.id })
  await publishAuditEntryEvent('created', created)
  return created
}

export async function deleteAuditEntry(id: string): Promise<void> {
  await getAuditEntry(id)
  await removeAuditEntry(id)
  await publishAuditEntryEvent('deleted', { id })
}
