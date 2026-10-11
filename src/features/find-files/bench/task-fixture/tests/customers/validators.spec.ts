import { expect, test } from 'vitest'
import { validateCustomer } from '../../src/customers/validators'

test('name is required', () => {
  expect(() => validateCustomer({ name: ' ', email: 'x', country: 'x', marketingOptIn: true, createdAt: new Date('2026-01-01') })).toThrow('name is required')
})
