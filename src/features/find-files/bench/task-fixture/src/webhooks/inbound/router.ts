import { Router } from 'express'
import { env } from '../../config/env'
import { rawBody } from '../../http/middleware/raw-body'
import { firstTimeSeen } from './replay-guard'
import { verifyProviderSignature } from './verify-signature'
import { onPaymentSucceeded } from './handlers/payment-succeeded'
import { onDisputeOpened } from './handlers/dispute-opened'

export const inbound = Router()

inbound.post('/webhooks/provider', rawBody, async (req, res) => {
  verifyProviderSignature(req.body as Buffer, req.header('provider-signature'), env.PAYMENT_PROVIDER_SECRET)
  const event = JSON.parse((req.body as Buffer).toString('utf8'))
  if (await firstTimeSeen(event.id)) {
    if (event.type === 'payment.succeeded') await onPaymentSucceeded(event)
    if (event.type === 'dispute.opened') await onDisputeOpened(event)
  }
  res.status(204).end()
})
