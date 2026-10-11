import { expect, test } from 'vitest'
import { validateWarehouse } from '../../src/warehouses/validators'

test('name is required', () => {
  expect(() => validateWarehouse({ name: ' ', region: 'x', capacity: 1 })).toThrow('name is required')
})
