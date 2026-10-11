import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishSupplierEvent } from './events'
import type { Supplier, NewSupplier } from './model'
import { fetchSuppliers, findSupplier, insertSupplier, removeSupplier } from './repo'
import { validateSupplier } from './validators'


export async function getSupplier(id: string): Promise<Supplier> {
  const found = await findSupplier(id)
  if (!found) throw notFound('supplier')
  return found
}

export async function listSuppliers(options: { limit?: number; offset?: number } = {}): Promise<Supplier[]> {
  return fetchSuppliers(options.limit, options.offset)
}

export async function createSupplier(input: NewSupplier): Promise<Supplier> {
  validateSupplier(input)
  const created = await insertSupplier(input)
  log.info('supplier created', { id: created.id })
  await publishSupplierEvent('created', created)
  return created
}

export async function deleteSupplier(id: string): Promise<void> {
  await getSupplier(id)
  await removeSupplier(id)
  await publishSupplierEvent('deleted', { id })
}
