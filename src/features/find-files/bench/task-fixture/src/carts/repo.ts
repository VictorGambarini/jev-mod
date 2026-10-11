import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Cart, NewCart } from './model'

export async function findCart(id: string): Promise<Cart | null> {
  const [row] = await query<Cart>(`SELECT id, customer_id, item_count, expires_at FROM carts WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchCarts(limit = 50, offset = 0): Promise<Cart[]> {
  return query<Cart>(`SELECT id, customer_id, item_count, expires_at FROM carts ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertCart(input: NewCart): Promise<Cart> {
  const id = newId('car')
  await withRetry(() => query(`INSERT INTO carts (id, customer_id, item_count, expires_at) VALUES ($1, $2, $3, $4)`, [id, input.customerId, input.itemCount, input.expiresAt]))
  return { id, ...input }
}

export async function removeCart(id: string): Promise<void> {
  await query(`DELETE FROM carts WHERE id = $1`, [id])
}
