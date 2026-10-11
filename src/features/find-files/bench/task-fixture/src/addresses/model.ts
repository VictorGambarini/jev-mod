export type Address = {
  id: string
  customerId: string
  line1: string
  city: string
  postcode: string
}

export type NewAddress = Omit<Address, 'id'>
