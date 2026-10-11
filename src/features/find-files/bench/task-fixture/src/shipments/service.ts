import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishShipmentEvent } from './events'
import type { Shipment, NewShipment } from './model'
import { fetchShipments, findShipment, insertShipment, removeShipment } from './repo'
import { validateShipment } from './validators'


export async function getShipment(id: string): Promise<Shipment> {
  const found = await findShipment(id)
  if (!found) throw notFound('shipment')
  return found
}

export async function listShipments(options: { limit?: number; offset?: number } = {}): Promise<Shipment[]> {
  return fetchShipments(options.limit, options.offset)
}

export async function createShipment(input: NewShipment): Promise<Shipment> {
  validateShipment(input)
  const created = await insertShipment(input)
  log.info('shipment created', { id: created.id })
  await publishShipmentEvent('created', created)
  return created
}

export async function deleteShipment(id: string): Promise<void> {
  await getShipment(id)
  await removeShipment(id)
  await publishShipmentEvent('deleted', { id })
}
