import { expect, test } from 'vitest'
import { validateCart } from '../../src/carts/validators'

test('customerId is required', () => {
  expect(() => validateCart({ customerId: ' ', itemCount: 1, expiresAt: new Date('2026-01-01') })).toThrow('customerId is required')
})
