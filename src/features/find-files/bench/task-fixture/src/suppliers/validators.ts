import { badRequest } from '../lib/errors'
import type { NewSupplier } from './model'

export function validateSupplier(input: NewSupplier): void {
  if (!input.name.trim()) throw badRequest('name is required')
  if (!input.contactEmail.trim()) throw badRequest('contactEmail is required')
  if (!Number.isFinite(input.leadDays) || input.leadDays < 0) throw badRequest('leadDays must be zero or more')
}
