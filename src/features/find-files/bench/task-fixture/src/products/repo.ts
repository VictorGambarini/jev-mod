import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Product, NewProduct } from './model'

export async function findProduct(id: string): Promise<Product | null> {
  const [row] = await query<Product>(`SELECT id, sku, name, price_cents, active FROM products WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchProducts(limit = 50, offset = 0): Promise<Product[]> {
  return query<Product>(`SELECT id, sku, name, price_cents, active FROM products ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertProduct(input: NewProduct): Promise<Product> {
  const id = newId('pro')
  await withRetry(() => query(`INSERT INTO products (id, sku, name, price_cents, active) VALUES ($1, $2, $3, $4, $5)`, [id, input.sku, input.name, input.priceCents, input.active]))
  return { id, ...input }
}

export async function removeProduct(id: string): Promise<void> {
  await query(`DELETE FROM products WHERE id = $1`, [id])
}
