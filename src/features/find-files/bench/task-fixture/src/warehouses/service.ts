import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishWarehouseEvent } from './events'
import type { Warehouse, NewWarehouse } from './model'
import { fetchWarehouses, findWarehouse, insertWarehouse, removeWarehouse } from './repo'
import { validateWarehouse } from './validators'


export async function getWarehouse(id: string): Promise<Warehouse> {
  const found = await findWarehouse(id)
  if (!found) throw notFound('warehouse')
  return found
}

export async function listWarehouses(options: { limit?: number; offset?: number } = {}): Promise<Warehouse[]> {
  return fetchWarehouses(options.limit, options.offset)
}

export async function createWarehouse(input: NewWarehouse): Promise<Warehouse> {
  validateWarehouse(input)
  const created = await insertWarehouse(input)
  log.info('warehouse created', { id: created.id })
  await publishWarehouseEvent('created', created)
  return created
}

export async function deleteWarehouse(id: string): Promise<void> {
  await getWarehouse(id)
  await removeWarehouse(id)
  await publishWarehouseEvent('deleted', { id })
}
