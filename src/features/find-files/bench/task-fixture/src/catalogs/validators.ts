import { badRequest } from '../lib/errors'
import type { NewCatalog } from './model'

export function validateCatalog(input: NewCatalog): void {
  if (!input.name.trim()) throw badRequest('name is required')
  if (!input.region.trim()) throw badRequest('region is required')
}
