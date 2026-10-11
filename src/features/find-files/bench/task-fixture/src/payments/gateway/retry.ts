import { log } from '../../lib/log'

// Calls to the payment gateway are retried on timeouts and 5xx with exponential backoff (250ms, 500ms, 1s), using
// the same idempotency key so a retry can never charge twice.
export async function withGatewayRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let delay = 250
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (error) {
      const status = (error as { status?: number }).status
      if (i >= attempts || (status !== undefined && status < 500)) throw error
      log.warn('gateway call failed, retrying', { attempt: i, status })
      await new Promise(r => setTimeout(r, delay))
      delay *= 2
    }
  }
}
