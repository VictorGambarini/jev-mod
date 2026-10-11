import { badRequest } from '../lib/errors'
import type { NewTeam } from './model'

export function validateTeam(input: NewTeam): void {
  if (!input.name.trim()) throw badRequest('name is required')
}
