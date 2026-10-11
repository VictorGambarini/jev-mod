import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Order, NewOrder } from './model'

export async function findOrder(id: string): Promise<Order | null> {
  const [row] = await query<Order>(`SELECT id, customer_id, total_cents, status, notes FROM orders WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchOrders(limit = 50, offset = 0): Promise<Order[]> {
  return query<Order>(`SELECT id, customer_id, total_cents, status, notes FROM orders ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertOrder(input: NewOrder): Promise<Order> {
  const id = newId('ord')
  await withRetry(() => query(`INSERT INTO orders (id, customer_id, total_cents, status, notes) VALUES ($1, $2, $3, $4, $5)`, [id, input.customerId, input.totalCents, input.status, input.notes]))
  return { id, ...input }
}

export async function removeOrder(id: string): Promise<void> {
  await query(`DELETE FROM orders WHERE id = $1`, [id])
}
