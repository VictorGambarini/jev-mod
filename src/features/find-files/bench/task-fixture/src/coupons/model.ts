export type Coupon = {
  id: string
  code: string
  percentOff: number
  expiresAt: Date | null
}

export type NewCoupon = Omit<Coupon, 'id'>
