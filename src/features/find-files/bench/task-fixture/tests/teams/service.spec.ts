import { expect, test, vi } from 'vitest'
import { createTeam, getTeam } from '../../src/teams/service'

vi.mock('../../src/teams/repo', () => ({
  insertTeam: vi.fn(async (input: object) => ({ id: 'tea_1', ...input })),
  findTeam: vi.fn(async (id: string) => (id === 'tea_1' ? { id, name: 'x', leadId: null } : null)),
  fetchTeams: vi.fn(async () => []),
  removeTeam: vi.fn(),
}))

test('creates a team and returns it with an id', async () => {
  const created = await createTeam({ name: 'x', leadId: null })
  expect(created.id).toBe('tea_1')
})

test('a missing team is a 404', async () => {
  await expect(getTeam('nope')).rejects.toMatchObject({ status: 404 })
})
