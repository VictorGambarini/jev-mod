import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishCatalogEvent } from './events'
import type { Catalog, NewCatalog } from './model'
import { fetchCatalogs, findCatalog, insertCatalog, removeCatalog } from './repo'
import { validateCatalog } from './validators'


export async function getCatalog(id: string): Promise<Catalog> {
  const found = await findCatalog(id)
  if (!found) throw notFound('catalog')
  return found
}

export async function listCatalogs(options: { limit?: number; offset?: number } = {}): Promise<Catalog[]> {
  return fetchCatalogs(options.limit, options.offset)
}

export async function createCatalog(input: NewCatalog): Promise<Catalog> {
  validateCatalog(input)
  const created = await insertCatalog(input)
  log.info('catalog created', { id: created.id })
  await publishCatalogEvent('created', created)
  return created
}

export async function deleteCatalog(id: string): Promise<void> {
  await getCatalog(id)
  await removeCatalog(id)
  await publishCatalogEvent('deleted', { id })
}
