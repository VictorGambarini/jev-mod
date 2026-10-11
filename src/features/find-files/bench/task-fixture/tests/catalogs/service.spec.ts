import { expect, test, vi } from 'vitest'
import { createCatalog, getCatalog } from '../../src/catalogs/service'

vi.mock('../../src/catalogs/repo', () => ({
  insertCatalog: vi.fn(async (input: object) => ({ id: 'cat_1', ...input })),
  findCatalog: vi.fn(async (id: string) => (id === 'cat_1' ? { id, name: 'x', region: 'x', published: true } : null)),
  fetchCatalogs: vi.fn(async () => []),
  removeCatalog: vi.fn(),
}))

test('creates a catalog and returns it with an id', async () => {
  const created = await createCatalog({ name: 'x', region: 'x', published: true })
  expect(created.id).toBe('cat_1')
})

test('a missing catalog is a 404', async () => {
  await expect(getCatalog('nope')).rejects.toMatchObject({ status: 404 })
})
