import { expect, test } from 'vitest'
import { validateCredit } from '../../src/credits/validators'

test('customerId is required', () => {
  expect(() => validateCredit({ customerId: ' ', cents: 1, reason: 'x' })).toThrow('customerId is required')
})
