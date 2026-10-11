import { expect, test } from 'vitest'
import { validateTeam } from '../../src/teams/validators'

test('name is required', () => {
  expect(() => validateTeam({ name: ' ', leadId: null })).toThrow('name is required')
})
