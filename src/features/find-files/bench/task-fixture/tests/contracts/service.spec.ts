import { expect, test, vi } from 'vitest'
import { createContract, getContract } from '../../src/contracts/service'

vi.mock('../../src/contracts/repo', () => ({
  insertContract: vi.fn(async (input: object) => ({ id: 'con_1', ...input })),
  findContract: vi.fn(async (id: string) => (id === 'con_1' ? { id, customerId: 'x', startsOn: new Date('2026-01-01'), endsOn: null, valueCents: 1 } : null)),
  fetchContracts: vi.fn(async () => []),
  removeContract: vi.fn(),
}))

test('creates a contract and returns it with an id', async () => {
  const created = await createContract({ customerId: 'x', startsOn: new Date('2026-01-01'), endsOn: null, valueCents: 1 })
  expect(created.id).toBe('con_1')
})

test('a missing contract is a 404', async () => {
  await expect(getContract('nope')).rejects.toMatchObject({ status: 404 })
})
