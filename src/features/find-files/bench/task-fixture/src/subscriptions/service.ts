import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishSubscriptionEvent } from './events'
import type { Subscription, NewSubscription } from './model'
import { fetchSubscriptions, findSubscription, insertSubscription, removeSubscription } from './repo'
import { validateSubscription } from './validators'
// Prices change only at renewal.

export async function getSubscription(id: string): Promise<Subscription> {
  const found = await findSubscription(id)
  if (!found) throw notFound('subscription')
  return found
}

export async function listSubscriptions(options: { limit?: number; offset?: number } = {}): Promise<Subscription[]> {
  return fetchSubscriptions(options.limit, options.offset)
}

export async function createSubscription(input: NewSubscription): Promise<Subscription> {
  validateSubscription(input)
  const created = await insertSubscription(input)
  log.info('subscription created', { id: created.id })
  await publishSubscriptionEvent('created', created)
  return created
}

export async function deleteSubscription(id: string): Promise<void> {
  await getSubscription(id)
  await removeSubscription(id)
  await publishSubscriptionEvent('deleted', { id })
}
