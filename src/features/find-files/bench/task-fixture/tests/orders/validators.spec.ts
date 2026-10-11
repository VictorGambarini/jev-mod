import { expect, test } from 'vitest'
import { validateOrder } from '../../src/orders/validators'

test('customerId is required', () => {
  expect(() => validateOrder({ customerId: ' ', totalCents: 1, status: 'x', notes: null })).toThrow('customerId is required')
})
