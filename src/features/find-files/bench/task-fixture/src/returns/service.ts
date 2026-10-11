import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishReturnRequestEvent } from './events'
import type { ReturnRequest, NewReturnRequest } from './model'
import { fetchReturnRequests, findReturnRequest, insertReturnRequest, removeReturnRequest } from './repo'
import { validateReturnRequest } from './validators'
// An approved return starts a refund on the finance side; nothing here calls the payment gateway.

export async function getReturnRequest(id: string): Promise<ReturnRequest> {
  const found = await findReturnRequest(id)
  if (!found) throw notFound('return request')
  return found
}

export async function listReturnRequests(options: { limit?: number; offset?: number } = {}): Promise<ReturnRequest[]> {
  return fetchReturnRequests(options.limit, options.offset)
}

export async function createReturnRequest(input: NewReturnRequest): Promise<ReturnRequest> {
  validateReturnRequest(input)
  const created = await insertReturnRequest(input)
  log.info('return request created', { id: created.id })
  await publishReturnRequestEvent('created', created)
  return created
}

export async function deleteReturnRequest(id: string): Promise<void> {
  await getReturnRequest(id)
  await removeReturnRequest(id)
  await publishReturnRequestEvent('deleted', { id })
}
