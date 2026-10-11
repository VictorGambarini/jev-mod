import { expect, test } from 'vitest'
import { validateContract } from '../../src/contracts/validators'

test('customerId is required', () => {
  expect(() => validateContract({ customerId: ' ', startsOn: new Date('2026-01-01'), endsOn: null, valueCents: 1 })).toThrow('customerId is required')
})
