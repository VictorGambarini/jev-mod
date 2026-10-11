import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Report, NewReport } from './model'

export async function findReport(id: string): Promise<Report | null> {
  const [row] = await query<Report>(`SELECT id, kind, requested_by, state FROM reports WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchReports(limit = 50, offset = 0): Promise<Report[]> {
  return query<Report>(`SELECT id, kind, requested_by, state FROM reports ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertReport(input: NewReport): Promise<Report> {
  const id = newId('rep')
  await withRetry(() => query(`INSERT INTO reports (id, kind, requested_by, state) VALUES ($1, $2, $3, $4)`, [id, input.kind, input.requestedBy, input.state]))
  return { id, ...input }
}

export async function removeReport(id: string): Promise<void> {
  await query(`DELETE FROM reports WHERE id = $1`, [id])
}
