import { badRequest } from '../lib/errors'
import type { NewPlan } from './model'

export function validatePlan(input: NewPlan): void {
  if (!input.code.trim()) throw badRequest('code is required')
  if (!input.name.trim()) throw badRequest('name is required')
  if (!Number.isFinite(input.monthlyCents) || input.monthlyCents < 0) throw badRequest('monthlyCents must be zero or more')
  if (!Number.isFinite(input.seats) || input.seats < 0) throw badRequest('seats must be zero or more')
}
