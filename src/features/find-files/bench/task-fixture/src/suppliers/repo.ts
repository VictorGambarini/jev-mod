import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Supplier, NewSupplier } from './model'

export async function findSupplier(id: string): Promise<Supplier | null> {
  const [row] = await query<Supplier>(`SELECT id, name, contact_email, lead_days FROM suppliers WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchSuppliers(limit = 50, offset = 0): Promise<Supplier[]> {
  return query<Supplier>(`SELECT id, name, contact_email, lead_days FROM suppliers ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertSupplier(input: NewSupplier): Promise<Supplier> {
  const id = newId('sup')
  await withRetry(() => query(`INSERT INTO suppliers (id, name, contact_email, lead_days) VALUES ($1, $2, $3, $4)`, [id, input.name, input.contactEmail, input.leadDays]))
  return { id, ...input }
}

export async function removeSupplier(id: string): Promise<void> {
  await query(`DELETE FROM suppliers WHERE id = $1`, [id])
}
