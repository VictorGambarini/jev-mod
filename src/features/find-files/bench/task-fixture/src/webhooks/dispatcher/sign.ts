import { createHmac } from 'node:crypto'

// Signs a webhook body that we send to a customer, so they can check it came from us.
export function signBody(body: string, secret: string, now = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac('sha256', secret).update(`${now}.${body}`).digest('hex')
  return `t=${now},v1=${mac}`
}
