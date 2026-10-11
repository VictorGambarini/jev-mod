import { badRequest } from '../lib/errors'
import type { NewReturnRequest } from './model'

export function validateReturnRequest(input: NewReturnRequest): void {
  if (!input.orderId.trim()) throw badRequest('orderId is required')
  if (!input.reason.trim()) throw badRequest('reason is required')
  if (!input.state.trim()) throw badRequest('state is required')
}
