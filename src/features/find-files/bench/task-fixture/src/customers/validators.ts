import { badRequest } from '../lib/errors'
import type { NewCustomer } from './model'

export function validateCustomer(input: NewCustomer): void {
  if (!input.name.trim()) throw badRequest('name is required')
  if (!input.email.trim()) throw badRequest('email is required')
  if (!input.country.trim()) throw badRequest('country is required')
}
