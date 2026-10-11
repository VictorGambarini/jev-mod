import { expect, test, vi } from 'vitest'
import { createAddress, getAddress } from '../../src/addresses/service'

vi.mock('../../src/addresses/repo', () => ({
  insertAddress: vi.fn(async (input: object) => ({ id: 'add_1', ...input })),
  findAddress: vi.fn(async (id: string) => (id === 'add_1' ? { id, customerId: 'x', line1: 'x', city: 'x', postcode: 'x' } : null)),
  fetchAddresss: vi.fn(async () => []),
  removeAddress: vi.fn(),
}))

test('creates a address and returns it with an id', async () => {
  const created = await createAddress({ customerId: 'x', line1: 'x', city: 'x', postcode: 'x' })
  expect(created.id).toBe('add_1')
})

test('a missing address is a 404', async () => {
  await expect(getAddress('nope')).rejects.toMatchObject({ status: 404 })
})
