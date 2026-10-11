import { expect, test } from 'vitest'
import { validateProduct } from '../../src/products/validators'

test('sku is required', () => {
  expect(() => validateProduct({ sku: ' ', name: 'x', priceCents: 1, active: true })).toThrow('sku is required')
})
