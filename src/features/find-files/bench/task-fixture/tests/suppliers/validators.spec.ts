import { expect, test } from 'vitest'
import { validateSupplier } from '../../src/suppliers/validators'

test('name is required', () => {
  expect(() => validateSupplier({ name: ' ', contactEmail: 'x', leadDays: 1 })).toThrow('name is required')
})
