import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { InventoryItem, NewInventoryItem } from './model'

export async function findInventoryItem(id: string): Promise<InventoryItem | null> {
  const [row] = await query<InventoryItem>(`SELECT id, sku, warehouse_id, on_hand FROM inventory WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchInventoryItems(limit = 50, offset = 0): Promise<InventoryItem[]> {
  return query<InventoryItem>(`SELECT id, sku, warehouse_id, on_hand FROM inventory ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertInventoryItem(input: NewInventoryItem): Promise<InventoryItem> {
  const id = newId('inv')
  await withRetry(() => query(`INSERT INTO inventory (id, sku, warehouse_id, on_hand) VALUES ($1, $2, $3, $4)`, [id, input.sku, input.warehouseId, input.onHand]))
  return { id, ...input }
}

export async function removeInventoryItem(id: string): Promise<void> {
  await query(`DELETE FROM inventory WHERE id = $1`, [id])
}
