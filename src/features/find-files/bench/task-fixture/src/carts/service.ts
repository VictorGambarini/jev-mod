import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishCartEvent } from './events'
import type { Cart, NewCart } from './model'
import { fetchCarts, findCart, insertCart, removeCart } from './repo'
import { validateCart } from './validators'


export async function getCart(id: string): Promise<Cart> {
  const found = await findCart(id)
  if (!found) throw notFound('cart')
  return found
}

export async function listCarts(options: { limit?: number; offset?: number } = {}): Promise<Cart[]> {
  return fetchCarts(options.limit, options.offset)
}

export async function createCart(input: NewCart): Promise<Cart> {
  validateCart(input)
  const created = await insertCart(input)
  log.info('cart created', { id: created.id })
  await publishCartEvent('created', created)
  return created
}

export async function deleteCart(id: string): Promise<void> {
  await getCart(id)
  await removeCart(id)
  await publishCartEvent('deleted', { id })
}
