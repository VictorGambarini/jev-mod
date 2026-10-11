import { expect, test, vi } from 'vitest'
import { createTicket, getTicket } from '../../src/tickets/service'

vi.mock('../../src/tickets/repo', () => ({
  insertTicket: vi.fn(async (input: object) => ({ id: 'tic_1', ...input })),
  findTicket: vi.fn(async (id: string) => (id === 'tic_1' ? { id, customerId: 'x', subject: 'x', state: 'x', assignee: null } : null)),
  fetchTickets: vi.fn(async () => []),
  removeTicket: vi.fn(),
}))

test('creates a ticket and returns it with an id', async () => {
  const created = await createTicket({ customerId: 'x', subject: 'x', state: 'x', assignee: null })
  expect(created.id).toBe('tic_1')
})

test('a missing ticket is a 404', async () => {
  await expect(getTicket('nope')).rejects.toMatchObject({ status: 404 })
})
