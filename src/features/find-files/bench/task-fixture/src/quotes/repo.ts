import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Quote, NewQuote } from './model'

export async function findQuote(id: string): Promise<Quote | null> {
  const [row] = await query<Quote>(`SELECT id, customer_id, valid_until, total_cents FROM quotes WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchQuotes(limit = 50, offset = 0): Promise<Quote[]> {
  return query<Quote>(`SELECT id, customer_id, valid_until, total_cents FROM quotes ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertQuote(input: NewQuote): Promise<Quote> {
  const id = newId('quo')
  await withRetry(() => query(`INSERT INTO quotes (id, customer_id, valid_until, total_cents) VALUES ($1, $2, $3, $4)`, [id, input.customerId, input.validUntil, input.totalCents]))
  return { id, ...input }
}

export async function removeQuote(id: string): Promise<void> {
  await query(`DELETE FROM quotes WHERE id = $1`, [id])
}
