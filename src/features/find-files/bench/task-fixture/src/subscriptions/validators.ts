import { badRequest } from '../lib/errors'
import type { NewSubscription } from './model'

export function validateSubscription(input: NewSubscription): void {
  if (!input.customerId.trim()) throw badRequest('customerId is required')
  if (!input.planId.trim()) throw badRequest('planId is required')
  if (!input.status.trim()) throw badRequest('status is required')
}
