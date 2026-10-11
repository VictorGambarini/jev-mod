import { expect, test } from 'vitest'
import { validatePlan } from '../../src/plans/validators'

test('code is required', () => {
  expect(() => validatePlan({ code: ' ', name: 'x', monthlyCents: 1, seats: 1 })).toThrow('code is required')
})
