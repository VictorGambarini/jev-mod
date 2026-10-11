import { expect, test } from 'vitest'
import { validateTicket } from '../../src/tickets/validators'

test('customerId is required', () => {
  expect(() => validateTicket({ customerId: ' ', subject: 'x', state: 'x', assignee: null })).toThrow('customerId is required')
})
