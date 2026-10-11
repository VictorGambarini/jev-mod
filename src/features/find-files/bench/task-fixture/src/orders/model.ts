export type Order = {
  id: string
  customerId: string
  totalCents: number
  status: string
  notes: string | null
}

export type NewOrder = Omit<Order, 'id'>
