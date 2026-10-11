import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Warehouse, NewWarehouse } from './model'

export async function findWarehouse(id: string): Promise<Warehouse | null> {
  const [row] = await query<Warehouse>(`SELECT id, name, region, capacity FROM warehouses WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchWarehouses(limit = 50, offset = 0): Promise<Warehouse[]> {
  return query<Warehouse>(`SELECT id, name, region, capacity FROM warehouses ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertWarehouse(input: NewWarehouse): Promise<Warehouse> {
  const id = newId('war')
  await withRetry(() => query(`INSERT INTO warehouses (id, name, region, capacity) VALUES ($1, $2, $3, $4)`, [id, input.name, input.region, input.capacity]))
  return { id, ...input }
}

export async function removeWarehouse(id: string): Promise<void> {
  await query(`DELETE FROM warehouses WHERE id = $1`, [id])
}
