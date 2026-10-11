import { expect, test, vi } from 'vitest'
import { createCredit, getCredit } from '../../src/credits/service'

vi.mock('../../src/credits/repo', () => ({
  insertCredit: vi.fn(async (input: object) => ({ id: 'cre_1', ...input })),
  findCredit: vi.fn(async (id: string) => (id === 'cre_1' ? { id, customerId: 'x', cents: 1, reason: 'x' } : null)),
  fetchCredits: vi.fn(async () => []),
  removeCredit: vi.fn(),
}))

test('creates a credit and returns it with an id', async () => {
  const created = await createCredit({ customerId: 'x', cents: 1, reason: 'x' })
  expect(created.id).toBe('cre_1')
})

test('a missing credit is a 404', async () => {
  await expect(getCredit('nope')).rejects.toMatchObject({ status: 404 })
})
