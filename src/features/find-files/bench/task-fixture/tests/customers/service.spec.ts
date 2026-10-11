import { expect, test, vi } from 'vitest'
import { createCustomer, getCustomer } from '../../src/customers/service'

vi.mock('../../src/customers/repo', () => ({
  insertCustomer: vi.fn(async (input: object) => ({ id: 'cus_1', ...input })),
  findCustomer: vi.fn(async (id: string) => (id === 'cus_1' ? { id, name: 'x', email: 'x', country: 'x', marketingOptIn: true, createdAt: new Date('2026-01-01') } : null)),
  fetchCustomers: vi.fn(async () => []),
  removeCustomer: vi.fn(),
}))

test('creates a customer and returns it with an id', async () => {
  const created = await createCustomer({ name: 'x', email: 'x', country: 'x', marketingOptIn: true, createdAt: new Date('2026-01-01') })
  expect(created.id).toBe('cus_1')
})

test('a missing customer is a 404', async () => {
  await expect(getCustomer('nope')).rejects.toMatchObject({ status: 404 })
})
