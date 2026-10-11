import { expect, test, vi } from 'vitest'
import { createReturnRequest, getReturnRequest } from '../../src/returns/service'

vi.mock('../../src/returns/repo', () => ({
  insertReturnRequest: vi.fn(async (input: object) => ({ id: 'ret_1', ...input })),
  findReturnRequest: vi.fn(async (id: string) => (id === 'ret_1' ? { id, orderId: 'x', reason: 'x', state: 'x' } : null)),
  fetchReturnRequests: vi.fn(async () => []),
  removeReturnRequest: vi.fn(),
}))

test('creates a return request and returns it with an id', async () => {
  const created = await createReturnRequest({ orderId: 'x', reason: 'x', state: 'x' })
  expect(created.id).toBe('ret_1')
})

test('a missing return request is a 404', async () => {
  await expect(getReturnRequest('nope')).rejects.toMatchObject({ status: 404 })
})
