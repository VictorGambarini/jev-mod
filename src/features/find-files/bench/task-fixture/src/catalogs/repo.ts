import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Catalog, NewCatalog } from './model'

export async function findCatalog(id: string): Promise<Catalog | null> {
  const [row] = await query<Catalog>(`SELECT id, name, region, published FROM catalogs WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchCatalogs(limit = 50, offset = 0): Promise<Catalog[]> {
  return query<Catalog>(`SELECT id, name, region, published FROM catalogs ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertCatalog(input: NewCatalog): Promise<Catalog> {
  const id = newId('cat')
  await withRetry(() => query(`INSERT INTO catalogs (id, name, region, published) VALUES ($1, $2, $3, $4)`, [id, input.name, input.region, input.published]))
  return { id, ...input }
}

export async function removeCatalog(id: string): Promise<void> {
  await query(`DELETE FROM catalogs WHERE id = $1`, [id])
}
