import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Address, NewAddress } from './model'

export async function findAddress(id: string): Promise<Address | null> {
  const [row] = await query<Address>(`SELECT id, customer_id, line1, city, postcode FROM addresses WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchAddresss(limit = 50, offset = 0): Promise<Address[]> {
  return query<Address>(`SELECT id, customer_id, line1, city, postcode FROM addresses ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertAddress(input: NewAddress): Promise<Address> {
  const id = newId('add')
  await withRetry(() => query(`INSERT INTO addresses (id, customer_id, line1, city, postcode) VALUES ($1, $2, $3, $4, $5)`, [id, input.customerId, input.line1, input.city, input.postcode]))
  return { id, ...input }
}

export async function removeAddress(id: string): Promise<void> {
  await query(`DELETE FROM addresses WHERE id = $1`, [id])
}
