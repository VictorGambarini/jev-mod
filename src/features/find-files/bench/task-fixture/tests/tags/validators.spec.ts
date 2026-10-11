import { expect, test } from 'vitest'
import { validateTag } from '../../src/tags/validators'

test('label is required', () => {
  expect(() => validateTag({ label: ' ', color: 'x' })).toThrow('label is required')
})
