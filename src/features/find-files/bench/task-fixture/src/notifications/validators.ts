import { badRequest } from '../lib/errors'
import type { NewNotification } from './model'

export function validateNotification(input: NewNotification): void {
  if (!input.recipientId.trim()) throw badRequest('recipientId is required')
  if (!input.channel.trim()) throw badRequest('channel is required')
}
