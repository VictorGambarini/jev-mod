import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { ReturnRequest, NewReturnRequest } from './model'

export async function findReturnRequest(id: string): Promise<ReturnRequest | null> {
  const [row] = await query<ReturnRequest>(`SELECT id, order_id, reason, state FROM returns WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchReturnRequests(limit = 50, offset = 0): Promise<ReturnRequest[]> {
  return query<ReturnRequest>(`SELECT id, order_id, reason, state FROM returns ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertReturnRequest(input: NewReturnRequest): Promise<ReturnRequest> {
  const id = newId('ret')
  await withRetry(() => query(`INSERT INTO returns (id, order_id, reason, state) VALUES ($1, $2, $3, $4)`, [id, input.orderId, input.reason, input.state]))
  return { id, ...input }
}

export async function removeReturnRequest(id: string): Promise<void> {
  await query(`DELETE FROM returns WHERE id = $1`, [id])
}
