import { newId } from '../../lib/ids'
import { log } from '../../lib/log'
import { nextAttemptDelaySeconds, shouldRetry } from './retry-policy'
import { signBody } from './sign'
import { saveAttempt } from './delivery-store'

export type Delivery = { id: string; endpointUrl: string; event: string; body: string; attempt: number }

export async function deliver(d: Delivery): Promise<void> {
  const signature = signBody(d.body, process.env.WEBHOOK_SIGNING_SECRET!)
  let status: number | null = null
  try {
    const res = await fetch(d.endpointUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'tillbox-signature': signature, 'tillbox-event': d.event },
      body: d.body,
      signal: AbortSignal.timeout(10_000),
    })
    status = res.status
  } catch (error) {
    log.warn('webhook delivery failed to connect', { id: d.id, error: String(error) })
  }
  const ok = status !== null && status < 300
  const delay = ok || !shouldRetry(status) ? null : nextAttemptDelaySeconds(d.attempt)
  await saveAttempt(d.id, d.attempt, status, delay === null ? null : new Date(Date.now() + delay * 1000))
}

export const newDelivery = (endpointUrl: string, event: string, payload: unknown): Delivery =>
  ({ id: newId('dlv'), endpointUrl, event, body: JSON.stringify(payload), attempt: 1 })
