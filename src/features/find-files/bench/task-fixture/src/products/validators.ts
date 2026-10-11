import { badRequest } from '../lib/errors'
import type { NewProduct } from './model'

export function validateProduct(input: NewProduct): void {
  if (!input.sku.trim()) throw badRequest('sku is required')
  if (!input.name.trim()) throw badRequest('name is required')
  if (!Number.isFinite(input.priceCents) || input.priceCents < 0) throw badRequest('priceCents must be zero or more')
}
