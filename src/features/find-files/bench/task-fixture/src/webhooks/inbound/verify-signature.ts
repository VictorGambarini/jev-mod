import { createHmac, timingSafeEqual } from 'node:crypto'
import { AppError } from '../../lib/errors'

const TOLERANCE_SECONDS = 300

// Checks the signature header on a webhook the payment provider sent us ("t=<unix>,v1=<hex hmac>").
// Throws 401 when it is missing, malformed, too old or does not match the raw body.
export function verifyProviderSignature(rawBody: Buffer, header: string | undefined, secret: string, now = Math.floor(Date.now() / 1000)): void {
  if (!header) throw new AppError(401, 'missing_signature', 'no signature header')
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=') as [string, string]))
  const t = Number(parts.t)
  if (!parts.v1 || !Number.isFinite(t)) throw new AppError(401, 'bad_signature', 'malformed signature header')
  if (Math.abs(now - t) > TOLERANCE_SECONDS) throw new AppError(401, 'stale_signature', 'signature timestamp too old')
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody.toString('utf8')}`).digest()
  const given = Buffer.from(parts.v1, 'hex')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new AppError(401, 'bad_signature', 'signature does not match')
}
