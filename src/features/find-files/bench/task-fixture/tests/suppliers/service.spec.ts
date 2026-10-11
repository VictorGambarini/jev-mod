import { expect, test, vi } from 'vitest'
import { createSupplier, getSupplier } from '../../src/suppliers/service'

vi.mock('../../src/suppliers/repo', () => ({
  insertSupplier: vi.fn(async (input: object) => ({ id: 'sup_1', ...input })),
  findSupplier: vi.fn(async (id: string) => (id === 'sup_1' ? { id, name: 'x', contactEmail: 'x', leadDays: 1 } : null)),
  fetchSuppliers: vi.fn(async () => []),
  removeSupplier: vi.fn(),
}))

test('creates a supplier and returns it with an id', async () => {
  const created = await createSupplier({ name: 'x', contactEmail: 'x', leadDays: 1 })
  expect(created.id).toBe('sup_1')
})

test('a missing supplier is a 404', async () => {
  await expect(getSupplier('nope')).rejects.toMatchObject({ status: 404 })
})
