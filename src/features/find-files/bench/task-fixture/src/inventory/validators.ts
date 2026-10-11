import { badRequest } from '../lib/errors'
import type { NewInventoryItem } from './model'

export function validateInventoryItem(input: NewInventoryItem): void {
  if (!input.sku.trim()) throw badRequest('sku is required')
  if (!input.warehouseId.trim()) throw badRequest('warehouseId is required')
  if (!Number.isFinite(input.onHand) || input.onHand < 0) throw badRequest('onHand must be zero or more')
}
