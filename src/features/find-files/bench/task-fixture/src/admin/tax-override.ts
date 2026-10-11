import { log } from '../lib/log'

// Support can set TAX_RATE_OVERRIDE on a single instance to bill a customer under a negotiated rate while a fix ships.
export function taxOverride(): number | null {
  const raw = process.env.TAX_RATE_OVERRIDE
  if (!raw) return null
  const rate = Number(raw)
  if (!Number.isFinite(rate)) {
    log.warn('ignoring a TAX_RATE_OVERRIDE that is not a number', { raw })
    return null
  }
  return rate
}
