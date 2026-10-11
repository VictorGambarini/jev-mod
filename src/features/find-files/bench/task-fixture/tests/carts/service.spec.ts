import { expect, test, vi } from 'vitest'
import { createCart, getCart } from '../../src/carts/service'

vi.mock('../../src/carts/repo', () => ({
  insertCart: vi.fn(async (input: object) => ({ id: 'car_1', ...input })),
  findCart: vi.fn(async (id: string) => (id === 'car_1' ? { id, customerId: 'x', itemCount: 1, expiresAt: new Date('2026-01-01') } : null)),
  fetchCarts: vi.fn(async () => []),
  removeCart: vi.fn(),
}))

test('creates a cart and returns it with an id', async () => {
  const created = await createCart({ customerId: 'x', itemCount: 1, expiresAt: new Date('2026-01-01') })
  expect(created.id).toBe('car_1')
})

test('a missing cart is a 404', async () => {
  await expect(getCart('nope')).rejects.toMatchObject({ status: 404 })
})
