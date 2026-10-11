import { expect, test } from 'vitest'
import { validateInventoryItem } from '../../src/inventory/validators'

test('sku is required', () => {
  expect(() => validateInventoryItem({ sku: ' ', warehouseId: 'x', onHand: 1 })).toThrow('sku is required')
})
