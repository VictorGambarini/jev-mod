export type Report = {
  id: string
  kind: string
  requestedBy: string
  state: string
}

export type NewReport = Omit<Report, 'id'>
