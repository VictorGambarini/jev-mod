import { expect, test, vi } from 'vitest'
import { createReview, getReview } from '../../src/reviews/service'

vi.mock('../../src/reviews/repo', () => ({
  insertReview: vi.fn(async (input: object) => ({ id: 'rev_1', ...input })),
  findReview: vi.fn(async (id: string) => (id === 'rev_1' ? { id, productId: 'x', rating: 1, body: 'x' } : null)),
  fetchReviews: vi.fn(async () => []),
  removeReview: vi.fn(),
}))

test('creates a review and returns it with an id', async () => {
  const created = await createReview({ productId: 'x', rating: 1, body: 'x' })
  expect(created.id).toBe('rev_1')
})

test('a missing review is a 404', async () => {
  await expect(getReview('nope')).rejects.toMatchObject({ status: 404 })
})
