import { badRequest } from '../lib/errors'
import type { NewShipment } from './model'

export function validateShipment(input: NewShipment): void {
  if (!input.orderId.trim()) throw badRequest('orderId is required')
  if (!input.carrier.trim()) throw badRequest('carrier is required')
}
