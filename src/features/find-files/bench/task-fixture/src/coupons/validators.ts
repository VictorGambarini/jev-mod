import { badRequest } from '../lib/errors'
import type { NewCoupon } from './model'

export function validateCoupon(input: NewCoupon): void {
  if (!input.code.trim()) throw badRequest('code is required')
  if (!Number.isFinite(input.percentOff) || input.percentOff < 0) throw badRequest('percentOff must be zero or more')
}
