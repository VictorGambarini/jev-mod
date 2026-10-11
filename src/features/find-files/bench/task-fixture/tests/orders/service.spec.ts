import { expect, test, vi } from 'vitest'
import { createOrder, getOrder } from '../../src/orders/service'

vi.mock('../../src/orders/repo', () => ({
  insertOrder: vi.fn(async (input: object) => ({ id: 'ord_1', ...input })),
  findOrder: vi.fn(async (id: string) => (id === 'ord_1' ? { id, customerId: 'x', totalCents: 1, status: 'x', notes: null } : null)),
  fetchOrders: vi.fn(async () => []),
  removeOrder: vi.fn(),
}))

test('creates a order and returns it with an id', async () => {
  const created = await createOrder({ customerId: 'x', totalCents: 1, status: 'x', notes: null })
  expect(created.id).toBe('ord_1')
})

test('a missing order is a 404', async () => {
  await expect(getOrder('nope')).rejects.toMatchObject({ status: 404 })
})
