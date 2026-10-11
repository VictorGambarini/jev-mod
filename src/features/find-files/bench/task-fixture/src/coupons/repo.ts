import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Coupon, NewCoupon } from './model'

export async function findCoupon(id: string): Promise<Coupon | null> {
  const [row] = await query<Coupon>(`SELECT id, code, percent_off, expires_at FROM coupons WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchCoupons(limit = 50, offset = 0): Promise<Coupon[]> {
  return query<Coupon>(`SELECT id, code, percent_off, expires_at FROM coupons ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertCoupon(input: NewCoupon): Promise<Coupon> {
  const id = newId('cou')
  await withRetry(() => query(`INSERT INTO coupons (id, code, percent_off, expires_at) VALUES ($1, $2, $3, $4)`, [id, input.code, input.percentOff, input.expiresAt]))
  return { id, ...input }
}

export async function removeCoupon(id: string): Promise<void> {
  await query(`DELETE FROM coupons WHERE id = $1`, [id])
}
