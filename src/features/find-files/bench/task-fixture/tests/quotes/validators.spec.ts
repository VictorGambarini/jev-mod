import { expect, test } from 'vitest'
import { validateQuote } from '../../src/quotes/validators'

test('customerId is required', () => {
  expect(() => validateQuote({ customerId: ' ', validUntil: new Date('2026-01-01'), totalCents: 1 })).toThrow('customerId is required')
})
