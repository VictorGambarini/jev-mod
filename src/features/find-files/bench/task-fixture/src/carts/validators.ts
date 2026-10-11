import { badRequest } from '../lib/errors'
import type { NewCart } from './model'

export function validateCart(input: NewCart): void {
  if (!input.customerId.trim()) throw badRequest('customerId is required')
  if (!Number.isFinite(input.itemCount) || input.itemCount < 0) throw badRequest('itemCount must be zero or more')
}
