import { expect, test, vi } from 'vitest'
import { createQuote, getQuote } from '../../src/quotes/service'

vi.mock('../../src/quotes/repo', () => ({
  insertQuote: vi.fn(async (input: object) => ({ id: 'quo_1', ...input })),
  findQuote: vi.fn(async (id: string) => (id === 'quo_1' ? { id, customerId: 'x', validUntil: new Date('2026-01-01'), totalCents: 1 } : null)),
  fetchQuotes: vi.fn(async () => []),
  removeQuote: vi.fn(),
}))

test('creates a quote and returns it with an id', async () => {
  const created = await createQuote({ customerId: 'x', validUntil: new Date('2026-01-01'), totalCents: 1 })
  expect(created.id).toBe('quo_1')
})

test('a missing quote is a 404', async () => {
  await expect(getQuote('nope')).rejects.toMatchObject({ status: 404 })
})
