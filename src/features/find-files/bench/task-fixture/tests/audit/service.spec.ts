import { expect, test, vi } from 'vitest'
import { createAuditEntry, getAuditEntry } from '../../src/audit/service'

vi.mock('../../src/audit/repo', () => ({
  insertAuditEntry: vi.fn(async (input: object) => ({ id: 'aud_1', ...input })),
  findAuditEntry: vi.fn(async (id: string) => (id === 'aud_1' ? { id, actor: 'x', action: 'x', at: new Date('2026-01-01') } : null)),
  fetchAuditEntrys: vi.fn(async () => []),
  removeAuditEntry: vi.fn(),
}))

test('creates a audit entry and returns it with an id', async () => {
  const created = await createAuditEntry({ actor: 'x', action: 'x', at: new Date('2026-01-01') })
  expect(created.id).toBe('aud_1')
})

test('a missing audit entry is a 404', async () => {
  await expect(getAuditEntry('nope')).rejects.toMatchObject({ status: 404 })
})
