export type Customer = {
  id: string
  name: string
  email: string
  country: string
  marketingOptIn: boolean
  createdAt: Date
}

export type NewCustomer = Omit<Customer, 'id'>
