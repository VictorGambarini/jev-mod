import { REGIONS } from '../../config/regions'
import { flags } from '../../config/flags'

// Cash rounding: NZD and AUD have no 1c or 2c coins, so an invoice paid in cash is rounded to the nearest 5c.
// Every other currency, and every card payment, keeps the exact total.
const FIVE_CENT_CURRENCIES = new Set(REGIONS.filter(r => r.code === 'NZ' || r.code === 'AU').map(r => r.currency))

export function roundInvoiceTotal(totalCents: number, currency: string, paidInCash: boolean): number {
  if (!flags.cashRounding || !paidInCash || !FIVE_CENT_CURRENCIES.has(currency)) return totalCents
  return Math.round(totalCents / 5) * 5
}
