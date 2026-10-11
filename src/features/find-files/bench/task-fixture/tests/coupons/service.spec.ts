import { expect, test, vi } from 'vitest'
import { createCoupon, getCoupon } from '../../src/coupons/service'

vi.mock('../../src/coupons/repo', () => ({
  insertCoupon: vi.fn(async (input: object) => ({ id: 'cou_1', ...input })),
  findCoupon: vi.fn(async (id: string) => (id === 'cou_1' ? { id, code: 'x', percentOff: 1, expiresAt: null } : null)),
  fetchCoupons: vi.fn(async () => []),
  removeCoupon: vi.fn(),
}))

test('creates a coupon and returns it with an id', async () => {
  const created = await createCoupon({ code: 'x', percentOff: 1, expiresAt: null })
  expect(created.id).toBe('cou_1')
})

test('a missing coupon is a 404', async () => {
  await expect(getCoupon('nope')).rejects.toMatchObject({ status: 404 })
})
