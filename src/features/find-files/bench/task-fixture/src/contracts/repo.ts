import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Contract, NewContract } from './model'

export async function findContract(id: string): Promise<Contract | null> {
  const [row] = await query<Contract>(`SELECT id, customer_id, starts_on, ends_on, value_cents FROM contracts WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchContracts(limit = 50, offset = 0): Promise<Contract[]> {
  return query<Contract>(`SELECT id, customer_id, starts_on, ends_on, value_cents FROM contracts ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertContract(input: NewContract): Promise<Contract> {
  const id = newId('con')
  await withRetry(() => query(`INSERT INTO contracts (id, customer_id, starts_on, ends_on, value_cents) VALUES ($1, $2, $3, $4, $5)`, [id, input.customerId, input.startsOn, input.endsOn, input.valueCents]))
  return { id, ...input }
}

export async function removeContract(id: string): Promise<void> {
  await query(`DELETE FROM contracts WHERE id = $1`, [id])
}
