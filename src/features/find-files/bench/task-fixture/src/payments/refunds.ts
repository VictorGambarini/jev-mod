import { gatewayPost } from './gateway/client'
import { withGatewayRetry } from './gateway/retry'
import { canRefundPayment } from './refund-policy'
import { query } from '../lib/db/pool'
import { conflict } from '../lib/errors'

export type Refund = { id: string; paymentId: string; amountCents: number; reason: string }

// Refunds a captured payment, in full or in part, and records it. The one place refunds are made.
export async function refundPayment(paymentId: string, amountCents: number, reason: string): Promise<Refund> {
  const [payment] = await query<{ captured_cents: number; refunded_cents: number }>(
    `SELECT captured_cents, refunded_cents FROM payments WHERE id = $1`, [paymentId])
  if (!payment || !canRefundPayment(payment.captured_cents, payment.refunded_cents, amountCents)) throw conflict('this payment cannot be refunded by that much')
  const refund = await withGatewayRetry(() => gatewayPost<Refund>('/refunds', { payment: paymentId, amount: amountCents, reason }))
  await query(`UPDATE payments SET refunded_cents = refunded_cents + $2 WHERE id = $1`, [paymentId, amountCents])
  return refund
}
