import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Review, NewReview } from './model'

export async function findReview(id: string): Promise<Review | null> {
  const [row] = await query<Review>(`SELECT id, product_id, rating, body FROM reviews WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchReviews(limit = 50, offset = 0): Promise<Review[]> {
  return query<Review>(`SELECT id, product_id, rating, body FROM reviews ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertReview(input: NewReview): Promise<Review> {
  const id = newId('rev')
  await withRetry(() => query(`INSERT INTO reviews (id, product_id, rating, body) VALUES ($1, $2, $3, $4)`, [id, input.productId, input.rating, input.body]))
  return { id, ...input }
}

export async function removeReview(id: string): Promise<void> {
  await query(`DELETE FROM reviews WHERE id = $1`, [id])
}
