import { expect, test, vi } from 'vitest'
import { createTag, getTag } from '../../src/tags/service'

vi.mock('../../src/tags/repo', () => ({
  insertTag: vi.fn(async (input: object) => ({ id: 'tag_1', ...input })),
  findTag: vi.fn(async (id: string) => (id === 'tag_1' ? { id, label: 'x', color: 'x' } : null)),
  fetchTags: vi.fn(async () => []),
  removeTag: vi.fn(),
}))

test('creates a tag and returns it with an id', async () => {
  const created = await createTag({ label: 'x', color: 'x' })
  expect(created.id).toBe('tag_1')
})

test('a missing tag is a 404', async () => {
  await expect(getTag('nope')).rejects.toMatchObject({ status: 404 })
})
