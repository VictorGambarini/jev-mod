import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishTicketEvent } from './events'
import type { Ticket, NewTicket } from './model'
import { fetchTickets, findTicket, insertTicket, removeTicket } from './repo'
import { validateTicket } from './validators'


export async function getTicket(id: string): Promise<Ticket> {
  const found = await findTicket(id)
  if (!found) throw notFound('ticket')
  return found
}

export async function listTickets(options: { limit?: number; offset?: number } = {}): Promise<Ticket[]> {
  return fetchTickets(options.limit, options.offset)
}

export async function createTicket(input: NewTicket): Promise<Ticket> {
  validateTicket(input)
  const created = await insertTicket(input)
  log.info('ticket created', { id: created.id })
  await publishTicketEvent('created', created)
  return created
}

export async function deleteTicket(id: string): Promise<void> {
  await getTicket(id)
  await removeTicket(id)
  await publishTicketEvent('deleted', { id })
}
