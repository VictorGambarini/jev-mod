import { expect, test } from 'vitest'
import { validateReport } from '../../src/reports/validators'

test('kind is required', () => {
  expect(() => validateReport({ kind: ' ', requestedBy: 'x', state: 'x' })).toThrow('kind is required')
})
