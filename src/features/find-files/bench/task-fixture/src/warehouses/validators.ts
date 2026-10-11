import { badRequest } from '../lib/errors'
import type { NewWarehouse } from './model'

export function validateWarehouse(input: NewWarehouse): void {
  if (!input.name.trim()) throw badRequest('name is required')
  if (!input.region.trim()) throw badRequest('region is required')
  if (!Number.isFinite(input.capacity) || input.capacity < 0) throw badRequest('capacity must be zero or more')
}
