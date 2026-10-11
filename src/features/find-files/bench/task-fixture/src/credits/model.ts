export type Credit = {
  id: string
  customerId: string
  cents: number
  reason: string
}

export type NewCredit = Omit<Credit, 'id'>
