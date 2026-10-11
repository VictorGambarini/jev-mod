import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Shipment, NewShipment } from './model'

export async function findShipment(id: string): Promise<Shipment | null> {
  const [row] = await query<Shipment>(`SELECT id, order_id, carrier, tracking FROM shipments WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchShipments(limit = 50, offset = 0): Promise<Shipment[]> {
  return query<Shipment>(`SELECT id, order_id, carrier, tracking FROM shipments ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertShipment(input: NewShipment): Promise<Shipment> {
  const id = newId('shi')
  await withRetry(() => query(`INSERT INTO shipments (id, order_id, carrier, tracking) VALUES ($1, $2, $3, $4)`, [id, input.orderId, input.carrier, input.tracking]))
  return { id, ...input }
}

export async function removeShipment(id: string): Promise<void> {
  await query(`DELETE FROM shipments WHERE id = $1`, [id])
}
