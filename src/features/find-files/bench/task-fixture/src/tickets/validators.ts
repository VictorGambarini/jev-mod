import { badRequest } from '../lib/errors'
import type { NewTicket } from './model'

export function validateTicket(input: NewTicket): void {
  if (!input.customerId.trim()) throw badRequest('customerId is required')
  if (!input.subject.trim()) throw badRequest('subject is required')
  if (!input.state.trim()) throw badRequest('state is required')
}
