import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishOrderEvent } from './events'
import type { Order, NewOrder } from './model'
import { fetchOrders, findOrder, insertOrder, removeOrder } from './repo'
import { validateOrder } from './validators'
// Orders over $5,000 need a second person to approve before they ship.

export async function getOrder(id: string): Promise<Order> {
  const found = await findOrder(id)
  if (!found) throw notFound('order')
  return found
}

export async function listOrders(options: { limit?: number; offset?: number } = {}): Promise<Order[]> {
  return fetchOrders(options.limit, options.offset)
}

export async function createOrder(input: NewOrder): Promise<Order> {
  validateOrder(input)
  const created = await insertOrder(input)
  log.info('order created', { id: created.id })
  await publishOrderEvent('created', created)
  return created
}

export async function deleteOrder(id: string): Promise<void> {
  await getOrder(id)
  await removeOrder(id)
  await publishOrderEvent('deleted', { id })
}
