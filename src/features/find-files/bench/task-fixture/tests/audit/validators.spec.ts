import { expect, test } from 'vitest'
import { validateAuditEntry } from '../../src/audit/validators'

test('actor is required', () => {
  expect(() => validateAuditEntry({ actor: ' ', action: 'x', at: new Date('2026-01-01') })).toThrow('actor is required')
})
