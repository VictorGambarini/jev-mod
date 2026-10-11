import { expect, test } from 'vitest'
import { validateCoupon } from '../../src/coupons/validators'

test('code is required', () => {
  expect(() => validateCoupon({ code: ' ', percentOff: 1, expiresAt: null })).toThrow('code is required')
})
