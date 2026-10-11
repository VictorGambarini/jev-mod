import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Credit, NewCredit } from './model'

export async function findCredit(id: string): Promise<Credit | null> {
  const [row] = await query<Credit>(`SELECT id, customer_id, cents, reason FROM credits WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchCredits(limit = 50, offset = 0): Promise<Credit[]> {
  return query<Credit>(`SELECT id, customer_id, cents, reason FROM credits ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertCredit(input: NewCredit): Promise<Credit> {
  const id = newId('cre')
  await withRetry(() => query(`INSERT INTO credits (id, customer_id, cents, reason) VALUES ($1, $2, $3, $4)`, [id, input.customerId, input.cents, input.reason]))
  return { id, ...input }
}

export async function removeCredit(id: string): Promise<void> {
  await query(`DELETE FROM credits WHERE id = $1`, [id])
}
