import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Customer, NewCustomer } from './model'

export async function findCustomer(id: string): Promise<Customer | null> {
  const [row] = await query<Customer>(`SELECT id, name, email, country, marketing_opt_in, created_at FROM customers WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchCustomers(limit = 50, offset = 0): Promise<Customer[]> {
  return query<Customer>(`SELECT id, name, email, country, marketing_opt_in, created_at FROM customers ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertCustomer(input: NewCustomer): Promise<Customer> {
  const id = newId('cus')
  await withRetry(() => query(`INSERT INTO customers (id, name, email, country, marketing_opt_in, created_at) VALUES ($1, $2, $3, $4, $5, $6)`, [id, input.name, input.email, input.country, input.marketingOptIn, input.createdAt]))
  return { id, ...input }
}

export async function removeCustomer(id: string): Promise<void> {
  await query(`DELETE FROM customers WHERE id = $1`, [id])
}
