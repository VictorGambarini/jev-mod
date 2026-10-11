import { badRequest } from '../lib/errors'
import type { NewReview } from './model'

export function validateReview(input: NewReview): void {
  if (!input.productId.trim()) throw badRequest('productId is required')
  if (!Number.isFinite(input.rating) || input.rating < 0) throw badRequest('rating must be zero or more')
  if (!input.body.trim()) throw badRequest('body is required')
}
