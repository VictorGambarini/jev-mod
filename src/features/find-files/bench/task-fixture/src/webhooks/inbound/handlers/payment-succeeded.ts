import { query } from '../../../lib/db/pool'

export async function onPaymentSucceeded(event: { data: { invoiceId: string; amountCents: number } }) {
  await query(`UPDATE invoices SET status = 'paid', paid_at = now() WHERE id = $1`, [event.data.invoiceId])
}
