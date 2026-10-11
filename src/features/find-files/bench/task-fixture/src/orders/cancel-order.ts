import { query } from '../lib/db/pool'
import { notFound } from '../lib/errors'
import { refundPayment } from '../payments/refunds'

// Cancels an order that has not shipped and gives the money back.
export async function cancelOrder(orderId: string, reason: string): Promise<void> {
  const [order] = await query<{ payment_id: string; total_cents: number; shipped_at: Date | null }>(
    `SELECT payment_id, total_cents, shipped_at FROM orders WHERE id = $1`, [orderId])
  if (!order) throw notFound('order')
  if (order.shipped_at) throw new Error('shipped orders are returned, not cancelled')
  await refundPayment(order.payment_id, order.total_cents, `order cancelled: ${reason}`)
  await query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [orderId])
}
