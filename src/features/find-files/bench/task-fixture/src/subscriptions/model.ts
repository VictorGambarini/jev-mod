export type Subscription = {
  id: string
  customerId: string
  planId: string
  status: string
  trialEndsAt: Date | null
}

export type NewSubscription = Omit<Subscription, 'id'>
