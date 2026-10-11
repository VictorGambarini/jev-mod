export type Contract = {
  id: string
  customerId: string
  startsOn: Date
  endsOn: Date | null
  valueCents: number
}

export type NewContract = Omit<Contract, 'id'>
