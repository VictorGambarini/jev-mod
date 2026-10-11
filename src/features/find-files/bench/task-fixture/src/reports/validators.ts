import { badRequest } from '../lib/errors'
import type { NewReport } from './model'

export function validateReport(input: NewReport): void {
  if (!input.kind.trim()) throw badRequest('kind is required')
  if (!input.requestedBy.trim()) throw badRequest('requestedBy is required')
  if (!input.state.trim()) throw badRequest('state is required')
}
