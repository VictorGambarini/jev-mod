import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishProductEvent } from './events'
import type { Product, NewProduct } from './model'
import { fetchProducts, findProduct, insertProduct, removeProduct } from './repo'
import { validateProduct } from './validators'


export async function getProduct(id: string): Promise<Product> {
  const found = await findProduct(id)
  if (!found) throw notFound('product')
  return found
}

export async function listProducts(options: { limit?: number; offset?: number } = {}): Promise<Product[]> {
  return fetchProducts(options.limit, options.offset)
}

export async function createProduct(input: NewProduct): Promise<Product> {
  validateProduct(input)
  const created = await insertProduct(input)
  log.info('product created', { id: created.id })
  await publishProductEvent('created', created)
  return created
}

export async function deleteProduct(id: string): Promise<void> {
  await getProduct(id)
  await removeProduct(id)
  await publishProductEvent('deleted', { id })
}
