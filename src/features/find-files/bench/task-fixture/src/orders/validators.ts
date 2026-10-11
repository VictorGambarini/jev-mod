import { badRequest } from '../lib/errors'
import type { NewOrder } from './model'

export function validateOrder(input: NewOrder): void {
  if (!input.customerId.trim()) throw badRequest('customerId is required')
  if (!Number.isFinite(input.totalCents) || input.totalCents < 0) throw badRequest('totalCents must be zero or more')
  if (!input.status.trim()) throw badRequest('status is required')
}
