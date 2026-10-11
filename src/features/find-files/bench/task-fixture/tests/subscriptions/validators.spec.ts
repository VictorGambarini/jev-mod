import { expect, test } from 'vitest'
import { validateSubscription } from '../../src/subscriptions/validators'

test('customerId is required', () => {
  expect(() => validateSubscription({ customerId: ' ', planId: 'x', status: 'x', trialEndsAt: null })).toThrow('customerId is required')
})
