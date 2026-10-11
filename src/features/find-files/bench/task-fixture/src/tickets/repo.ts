import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Ticket, NewTicket } from './model'

export async function findTicket(id: string): Promise<Ticket | null> {
  const [row] = await query<Ticket>(`SELECT id, customer_id, subject, state, assignee FROM tickets WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchTickets(limit = 50, offset = 0): Promise<Ticket[]> {
  return query<Ticket>(`SELECT id, customer_id, subject, state, assignee FROM tickets ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertTicket(input: NewTicket): Promise<Ticket> {
  const id = newId('tic')
  await withRetry(() => query(`INSERT INTO tickets (id, customer_id, subject, state, assignee) VALUES ($1, $2, $3, $4, $5)`, [id, input.customerId, input.subject, input.state, input.assignee]))
  return { id, ...input }
}

export async function removeTicket(id: string): Promise<void> {
  await query(`DELETE FROM tickets WHERE id = $1`, [id])
}
