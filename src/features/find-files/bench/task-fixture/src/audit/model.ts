export type AuditEntry = {
  id: string
  actor: string
  action: string
  at: Date
}

export type NewAuditEntry = Omit<AuditEntry, 'id'>
