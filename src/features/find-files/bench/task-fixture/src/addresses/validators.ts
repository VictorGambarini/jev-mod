import { badRequest } from '../lib/errors'
import type { NewAddress } from './model'

export function validateAddress(input: NewAddress): void {
  if (!input.customerId.trim()) throw badRequest('customerId is required')
  if (!input.line1.trim()) throw badRequest('line1 is required')
  if (!input.city.trim()) throw badRequest('city is required')
  if (!input.postcode.trim()) throw badRequest('postcode is required')
}
