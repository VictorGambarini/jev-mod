import { expect, test } from 'vitest'
import { validateCatalog } from '../../src/catalogs/validators'

test('name is required', () => {
  expect(() => validateCatalog({ name: ' ', region: 'x', published: true })).toThrow('name is required')
})
