import { expect, test } from 'vitest'
import { validateAddress } from '../../src/addresses/validators'

test('customerId is required', () => {
  expect(() => validateAddress({ customerId: ' ', line1: 'x', city: 'x', postcode: 'x' })).toThrow('customerId is required')
})
