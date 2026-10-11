import { expect, test, vi } from 'vitest'
import { createNote, getNote } from '../../src/notes/service'

vi.mock('../../src/notes/repo', () => ({
  insertNote: vi.fn(async (input: object) => ({ id: 'not_1', ...input })),
  findNote: vi.fn(async (id: string) => (id === 'not_1' ? { id, subjectId: 'x', author: 'x', body: 'x' } : null)),
  fetchNotes: vi.fn(async () => []),
  removeNote: vi.fn(),
}))

test('creates a note and returns it with an id', async () => {
  const created = await createNote({ subjectId: 'x', author: 'x', body: 'x' })
  expect(created.id).toBe('not_1')
})

test('a missing note is a 404', async () => {
  await expect(getNote('nope')).rejects.toMatchObject({ status: 404 })
})
