import { badRequest } from '../lib/errors'
import type { NewAuditEntry } from './model'

export function validateAuditEntry(input: NewAuditEntry): void {
  if (!input.actor.trim()) throw badRequest('actor is required')
  if (!input.action.trim()) throw badRequest('action is required')
}
