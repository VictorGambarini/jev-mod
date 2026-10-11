import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishReviewEvent } from './events'
import type { Review, NewReview } from './model'
import { fetchReviews, findReview, insertReview, removeReview } from './repo'
import { validateReview } from './validators'


export async function getReview(id: string): Promise<Review> {
  const found = await findReview(id)
  if (!found) throw notFound('review')
  return found
}

export async function listReviews(options: { limit?: number; offset?: number } = {}): Promise<Review[]> {
  return fetchReviews(options.limit, options.offset)
}

export async function createReview(input: NewReview): Promise<Review> {
  validateReview(input)
  const created = await insertReview(input)
  log.info('review created', { id: created.id })
  await publishReviewEvent('created', created)
  return created
}

export async function deleteReview(id: string): Promise<void> {
  await getReview(id)
  await removeReview(id)
  await publishReviewEvent('deleted', { id })
}
