import { expect, test, vi } from 'vitest'
import { createShipment, getShipment } from '../../src/shipments/service'

vi.mock('../../src/shipments/repo', () => ({
  insertShipment: vi.fn(async (input: object) => ({ id: 'shi_1', ...input })),
  findShipment: vi.fn(async (id: string) => (id === 'shi_1' ? { id, orderId: 'x', carrier: 'x', tracking: null } : null)),
  fetchShipments: vi.fn(async () => []),
  removeShipment: vi.fn(),
}))

test('creates a shipment and returns it with an id', async () => {
  const created = await createShipment({ orderId: 'x', carrier: 'x', tracking: null })
  expect(created.id).toBe('shi_1')
})

test('a missing shipment is a 404', async () => {
  await expect(getShipment('nope')).rejects.toMatchObject({ status: 404 })
})
