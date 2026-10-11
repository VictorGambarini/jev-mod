import { badRequest } from '../lib/errors'
import type { NewTag } from './model'

export function validateTag(input: NewTag): void {
  if (!input.label.trim()) throw badRequest('label is required')
  if (!input.color.trim()) throw badRequest('color is required')
}
