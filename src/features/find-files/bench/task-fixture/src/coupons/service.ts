import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishCouponEvent } from './events'
import type { Coupon, NewCoupon } from './model'
import { fetchCoupons, findCoupon, insertCoupon, removeCoupon } from './repo'
import { validateCoupon } from './validators'
// Coupon percentages apply before tax.

export async function getCoupon(id: string): Promise<Coupon> {
  const found = await findCoupon(id)
  if (!found) throw notFound('coupon')
  return found
}

export async function listCoupons(options: { limit?: number; offset?: number } = {}): Promise<Coupon[]> {
  return fetchCoupons(options.limit, options.offset)
}

export async function createCoupon(input: NewCoupon): Promise<Coupon> {
  validateCoupon(input)
  const created = await insertCoupon(input)
  log.info('coupon created', { id: created.id })
  await publishCouponEvent('created', created)
  return created
}

export async function deleteCoupon(id: string): Promise<void> {
  await getCoupon(id)
  await removeCoupon(id)
  await publishCouponEvent('deleted', { id })
}
