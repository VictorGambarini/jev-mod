import { badRequest } from '../lib/errors'
import type { NewNote } from './model'

export function validateNote(input: NewNote): void {
  if (!input.subjectId.trim()) throw badRequest('subjectId is required')
  if (!input.author.trim()) throw badRequest('author is required')
  if (!input.body.trim()) throw badRequest('body is required')
}
