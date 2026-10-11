export type Quote = {
  id: string
  customerId: string
  validUntil: Date
  totalCents: number
}

export type NewQuote = Omit<Quote, 'id'>
