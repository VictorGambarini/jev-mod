export type Ticket = {
  id: string
  customerId: string
  subject: string
  state: string
  assignee: string | null
}

export type NewTicket = Omit<Ticket, 'id'>
