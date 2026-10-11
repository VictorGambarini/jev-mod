import { expect, test } from 'vitest'
import { validateReturnRequest } from '../../src/returns/validators'

test('orderId is required', () => {
  expect(() => validateReturnRequest({ orderId: ' ', reason: 'x', state: 'x' })).toThrow('orderId is required')
})
