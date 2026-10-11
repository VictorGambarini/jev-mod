import { expect, test, vi } from 'vitest'
import { createSubscription, getSubscription } from '../../src/subscriptions/service'

vi.mock('../../src/subscriptions/repo', () => ({
  insertSubscription: vi.fn(async (input: object) => ({ id: 'sub_1', ...input })),
  findSubscription: vi.fn(async (id: string) => (id === 'sub_1' ? { id, customerId: 'x', planId: 'x', status: 'x', trialEndsAt: null } : null)),
  fetchSubscriptions: vi.fn(async () => []),
  removeSubscription: vi.fn(),
}))

test('creates a subscription and returns it with an id', async () => {
  const created = await createSubscription({ customerId: 'x', planId: 'x', status: 'x', trialEndsAt: null })
  expect(created.id).toBe('sub_1')
})

test('a missing subscription is a 404', async () => {
  await expect(getSubscription('nope')).rejects.toMatchObject({ status: 404 })
})
