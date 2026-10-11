import { expect, test } from 'vitest'
import { validateNotification } from '../../src/notifications/validators'

test('recipientId is required', () => {
  expect(() => validateNotification({ recipientId: ' ', channel: 'x', sentAt: null })).toThrow('recipientId is required')
})
