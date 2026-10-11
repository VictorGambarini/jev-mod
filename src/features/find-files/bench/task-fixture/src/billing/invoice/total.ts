import { lineTaxCents, type Line } from '../tax/line-tax'
import { roundInvoiceTotal } from './rounding'

export type Totals = { subtotalCents: number; taxCents: number; totalCents: number }

export function invoiceTotals(lines: Line[], region: string, currency: string, paidInCash = false): Totals {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitCents * l.quantity, 0)
  const taxCents = lines.reduce((sum, l) => sum + lineTaxCents(l, region), 0)
  return { subtotalCents, taxCents, totalCents: roundInvoiceTotal(subtotalCents + taxCents, currency, paidInCash) }
}
