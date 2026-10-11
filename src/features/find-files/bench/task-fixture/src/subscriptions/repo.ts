import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Subscription, NewSubscription } from './model'

export async function findSubscription(id: string): Promise<Subscription | null> {
  const [row] = await query<Subscription>(`SELECT id, customer_id, plan_id, status, trial_ends_at FROM subscriptions WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchSubscriptions(limit = 50, offset = 0): Promise<Subscription[]> {
  return query<Subscription>(`SELECT id, customer_id, plan_id, status, trial_ends_at FROM subscriptions ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertSubscription(input: NewSubscription): Promise<Subscription> {
  const id = newId('sub')
  await withRetry(() => query(`INSERT INTO subscriptions (id, customer_id, plan_id, status, trial_ends_at) VALUES ($1, $2, $3, $4, $5)`, [id, input.customerId, input.planId, input.status, input.trialEndsAt]))
  return { id, ...input }
}

export async function removeSubscription(id: string): Promise<void> {
  await query(`DELETE FROM subscriptions WHERE id = $1`, [id])
}
