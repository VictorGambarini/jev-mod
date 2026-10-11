import { query } from '../lib/db/pool'
import { prorate } from '../billing/invoice/proration'

// Cancels at the end of the period, or now with a prorated credit when `immediately` is set.
export async function cancelSubscription(id: string, immediately: boolean): Promise<void> {
  if (!immediately) {
    await query(`UPDATE subscriptions SET cancel_at_period_end = true WHERE id = $1`, [id])
    return
  }
  const [s] = await query<{ price_cents: number; days_used: number; days_in_period: number }>(
    `SELECT price_cents, days_used, days_in_period FROM subscription_periods WHERE subscription_id = $1`, [id])
  if (s) await refundPaymentLater(id, prorate(s.price_cents, s.days_used, s.days_in_period))
  await query(`UPDATE subscriptions SET status = 'cancelled' WHERE id = $1`, [id])
}

// Queues the credit for the nightly batch instead of refunding straight away.
async function refundPaymentLater(subscriptionId: string, cents: number): Promise<void> {
  await query(`INSERT INTO pending_credits (subscription_id, cents) VALUES ($1, $2)`, [subscriptionId, cents])
}
