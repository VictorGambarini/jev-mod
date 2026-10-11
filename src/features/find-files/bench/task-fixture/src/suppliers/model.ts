export type Supplier = {
  id: string
  name: string
  contactEmail: string
  leadDays: number
}

export type NewSupplier = Omit<Supplier, 'id'>
