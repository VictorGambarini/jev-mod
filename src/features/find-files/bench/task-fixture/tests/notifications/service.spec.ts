import { expect, test, vi } from 'vitest'
import { createNotification, getNotification } from '../../src/notifications/service'

vi.mock('../../src/notifications/repo', () => ({
  insertNotification: vi.fn(async (input: object) => ({ id: 'not_1', ...input })),
  findNotification: vi.fn(async (id: string) => (id === 'not_1' ? { id, recipientId: 'x', channel: 'x', sentAt: null } : null)),
  fetchNotifications: vi.fn(async () => []),
  removeNotification: vi.fn(),
}))

test('creates a notification and returns it with an id', async () => {
  const created = await createNotification({ recipientId: 'x', channel: 'x', sentAt: null })
  expect(created.id).toBe('not_1')
})

test('a missing notification is a 404', async () => {
  await expect(getNotification('nope')).rejects.toMatchObject({ status: 404 })
})
