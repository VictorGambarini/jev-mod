import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { AuditEntry, NewAuditEntry } from './model'

export async function findAuditEntry(id: string): Promise<AuditEntry | null> {
  const [row] = await query<AuditEntry>(`SELECT id, actor, action, at FROM audit WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchAuditEntrys(limit = 50, offset = 0): Promise<AuditEntry[]> {
  return query<AuditEntry>(`SELECT id, actor, action, at FROM audit ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertAuditEntry(input: NewAuditEntry): Promise<AuditEntry> {
  const id = newId('aud')
  await withRetry(() => query(`INSERT INTO audit (id, actor, action, at) VALUES ($1, $2, $3, $4)`, [id, input.actor, input.action, input.at]))
  return { id, ...input }
}

export async function removeAuditEntry(id: string): Promise<void> {
  await query(`DELETE FROM audit WHERE id = $1`, [id])
}
