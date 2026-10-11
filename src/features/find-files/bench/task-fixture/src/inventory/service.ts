import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishInventoryItemEvent } from './events'
import type { InventoryItem, NewInventoryItem } from './model'
import { fetchInventoryItems, findInventoryItem, insertInventoryItem, removeInventoryItem } from './repo'
import { validateInventoryItem } from './validators'


export async function getInventoryItem(id: string): Promise<InventoryItem> {
  const found = await findInventoryItem(id)
  if (!found) throw notFound('inventory item')
  return found
}

export async function listInventoryItems(options: { limit?: number; offset?: number } = {}): Promise<InventoryItem[]> {
  return fetchInventoryItems(options.limit, options.offset)
}

export async function createInventoryItem(input: NewInventoryItem): Promise<InventoryItem> {
  validateInventoryItem(input)
  const created = await insertInventoryItem(input)
  log.info('inventory item created', { id: created.id })
  await publishInventoryItemEvent('created', created)
  return created
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await getInventoryItem(id)
  await removeInventoryItem(id)
  await publishInventoryItemEvent('deleted', { id })
}
