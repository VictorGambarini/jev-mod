export type ReturnRequest = {
  id: string
  orderId: string
  reason: string
  state: string
}

export type NewReturnRequest = Omit<ReturnRequest, 'id'>
