import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishCustomerEvent } from './events'
import type { Customer, NewCustomer } from './model'
import { fetchCustomers, findCustomer, insertCustomer, removeCustomer } from './repo'
import { validateCustomer } from './validators'


export async function getCustomer(id: string): Promise<Customer> {
  const found = await findCustomer(id)
  if (!found) throw notFound('customer')
  return found
}

export async function listCustomers(options: { limit?: number; offset?: number } = {}): Promise<Customer[]> {
  return fetchCustomers(options.limit, options.offset)
}

export async function createCustomer(input: NewCustomer): Promise<Customer> {
  validateCustomer(input)
  const created = await insertCustomer(input)
  log.info('customer created', { id: created.id })
  await publishCustomerEvent('created', created)
  return created
}

export async function deleteCustomer(id: string): Promise<void> {
  await getCustomer(id)
  await removeCustomer(id)
  await publishCustomerEvent('deleted', { id })
}
