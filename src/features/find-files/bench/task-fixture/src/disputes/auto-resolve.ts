import { query } from '../lib/db/pool'
import { log } from '../lib/log'
import { refundPayment } from '../payments/refunds'

// Disputes under $25 are cheaper to refund than to contest, so we refund them and close the dispute.
const AUTO_REFUND_BELOW_CENTS = 2500

export async function autoResolve(disputeId: string): Promise<boolean> {
  const [d] = await query<{ payment_id: string; amount_cents: number }>(`SELECT payment_id, amount_cents FROM disputes WHERE id = $1`, [disputeId])
  if (!d || d.amount_cents >= AUTO_REFUND_BELOW_CENTS) return false
  await refundPayment(d.payment_id, d.amount_cents, 'auto-resolved dispute')
  await query(`UPDATE disputes SET state = 'resolved_refunded' WHERE id = $1`, [disputeId])
  log.info('dispute auto-resolved', { disputeId })
  return true
}
