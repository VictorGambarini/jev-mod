import { expect, test } from 'vitest'
import { validateShipment } from '../../src/shipments/validators'

test('orderId is required', () => {
  expect(() => validateShipment({ orderId: ' ', carrier: 'x', tracking: null })).toThrow('orderId is required')
})
