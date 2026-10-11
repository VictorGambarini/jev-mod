import { expect, test, vi } from 'vitest'
import { createPlan, getPlan } from '../../src/plans/service'

vi.mock('../../src/plans/repo', () => ({
  insertPlan: vi.fn(async (input: object) => ({ id: 'pla_1', ...input })),
  findPlan: vi.fn(async (id: string) => (id === 'pla_1' ? { id, code: 'x', name: 'x', monthlyCents: 1, seats: 1 } : null)),
  fetchPlans: vi.fn(async () => []),
  removePlan: vi.fn(),
}))

test('creates a plan and returns it with an id', async () => {
  const created = await createPlan({ code: 'x', name: 'x', monthlyCents: 1, seats: 1 })
  expect(created.id).toBe('pla_1')
})

test('a missing plan is a 404', async () => {
  await expect(getPlan('nope')).rejects.toMatchObject({ status: 404 })
})
