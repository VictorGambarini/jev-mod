export type Cart = {
  id: string
  customerId: string
  itemCount: number
  expiresAt: Date
}

export type NewCart = Omit<Cart, 'id'>
