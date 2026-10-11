import { badRequest } from '../lib/errors'
import type { NewCredit } from './model'

export function validateCredit(input: NewCredit): void {
  if (!input.customerId.trim()) throw badRequest('customerId is required')
  if (!Number.isFinite(input.cents) || input.cents < 0) throw badRequest('cents must be zero or more')
  if (!input.reason.trim()) throw badRequest('reason is required')
}
