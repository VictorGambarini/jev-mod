import { badRequest } from '../lib/errors'
import type { NewQuote } from './model'

export function validateQuote(input: NewQuote): void {
  if (!input.customerId.trim()) throw badRequest('customerId is required')
  if (!Number.isFinite(input.totalCents) || input.totalCents < 0) throw badRequest('totalCents must be zero or more')
}
