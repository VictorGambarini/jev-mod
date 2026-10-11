import { expect, test, vi } from 'vitest'
import { createInventoryItem, getInventoryItem } from '../../src/inventory/service'

vi.mock('../../src/inventory/repo', () => ({
  insertInventoryItem: vi.fn(async (input: object) => ({ id: 'inv_1', ...input })),
  findInventoryItem: vi.fn(async (id: string) => (id === 'inv_1' ? { id, sku: 'x', warehouseId: 'x', onHand: 1 } : null)),
  fetchInventoryItems: vi.fn(async () => []),
  removeInventoryItem: vi.fn(),
}))

test('creates a inventory item and returns it with an id', async () => {
  const created = await createInventoryItem({ sku: 'x', warehouseId: 'x', onHand: 1 })
  expect(created.id).toBe('inv_1')
})

test('a missing inventory item is a 404', async () => {
  await expect(getInventoryItem('nope')).rejects.toMatchObject({ status: 404 })
})
