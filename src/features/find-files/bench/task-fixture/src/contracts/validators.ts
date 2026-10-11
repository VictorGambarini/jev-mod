import { badRequest } from '../lib/errors'
import type { NewContract } from './model'

export function validateContract(input: NewContract): void {
  if (!input.customerId.trim()) throw badRequest('customerId is required')
  if (!Number.isFinite(input.valueCents) || input.valueCents < 0) throw badRequest('valueCents must be zero or more')
}
