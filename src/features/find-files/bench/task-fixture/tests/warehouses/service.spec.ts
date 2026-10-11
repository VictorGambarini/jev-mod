import { expect, test, vi } from 'vitest'
import { createWarehouse, getWarehouse } from '../../src/warehouses/service'

vi.mock('../../src/warehouses/repo', () => ({
  insertWarehouse: vi.fn(async (input: object) => ({ id: 'war_1', ...input })),
  findWarehouse: vi.fn(async (id: string) => (id === 'war_1' ? { id, name: 'x', region: 'x', capacity: 1 } : null)),
  fetchWarehouses: vi.fn(async () => []),
  removeWarehouse: vi.fn(),
}))

test('creates a warehouse and returns it with an id', async () => {
  const created = await createWarehouse({ name: 'x', region: 'x', capacity: 1 })
  expect(created.id).toBe('war_1')
})

test('a missing warehouse is a 404', async () => {
  await expect(getWarehouse('nope')).rejects.toMatchObject({ status: 404 })
})
