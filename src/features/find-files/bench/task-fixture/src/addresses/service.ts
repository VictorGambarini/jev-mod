import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishAddressEvent } from './events'
import type { Address, NewAddress } from './model'
import { fetchAddresss, findAddress, insertAddress, removeAddress } from './repo'
import { validateAddress } from './validators'


export async function getAddress(id: string): Promise<Address> {
  const found = await findAddress(id)
  if (!found) throw notFound('address')
  return found
}

export async function listAddresss(options: { limit?: number; offset?: number } = {}): Promise<Address[]> {
  return fetchAddresss(options.limit, options.offset)
}

export async function createAddress(input: NewAddress): Promise<Address> {
  validateAddress(input)
  const created = await insertAddress(input)
  log.info('address created', { id: created.id })
  await publishAddressEvent('created', created)
  return created
}

export async function deleteAddress(id: string): Promise<void> {
  await getAddress(id)
  await removeAddress(id)
  await publishAddressEvent('deleted', { id })
}
