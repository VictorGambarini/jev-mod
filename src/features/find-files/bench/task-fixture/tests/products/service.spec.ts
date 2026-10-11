import { expect, test, vi } from 'vitest'
import { createProduct, getProduct } from '../../src/products/service'

vi.mock('../../src/products/repo', () => ({
  insertProduct: vi.fn(async (input: object) => ({ id: 'pro_1', ...input })),
  findProduct: vi.fn(async (id: string) => (id === 'pro_1' ? { id, sku: 'x', name: 'x', priceCents: 1, active: true } : null)),
  fetchProducts: vi.fn(async () => []),
  removeProduct: vi.fn(),
}))

test('creates a product and returns it with an id', async () => {
  const created = await createProduct({ sku: 'x', name: 'x', priceCents: 1, active: true })
  expect(created.id).toBe('pro_1')
})

test('a missing product is a 404', async () => {
  await expect(getProduct('nope')).rejects.toMatchObject({ status: 404 })
})
