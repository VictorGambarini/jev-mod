import { query } from '../lib/db/pool'
import { newId } from '../lib/ids'

export async function openDispute(paymentId: string, reason: string): Promise<string> {
  const id = newId('dsp')
  await query(`INSERT INTO disputes (id, payment_id, reason, state) VALUES ($1, $2, $3, 'open')`, [id, paymentId, reason])
  return id
}
