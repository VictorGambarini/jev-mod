import { expect, test, vi } from 'vitest'
import { createReport, getReport } from '../../src/reports/service'

vi.mock('../../src/reports/repo', () => ({
  insertReport: vi.fn(async (input: object) => ({ id: 'rep_1', ...input })),
  findReport: vi.fn(async (id: string) => (id === 'rep_1' ? { id, kind: 'x', requestedBy: 'x', state: 'x' } : null)),
  fetchReports: vi.fn(async () => []),
  removeReport: vi.fn(),
}))

test('creates a report and returns it with an id', async () => {
  const created = await createReport({ kind: 'x', requestedBy: 'x', state: 'x' })
  expect(created.id).toBe('rep_1')
})

test('a missing report is a 404', async () => {
  await expect(getReport('nope')).rejects.toMatchObject({ status: 404 })
})
