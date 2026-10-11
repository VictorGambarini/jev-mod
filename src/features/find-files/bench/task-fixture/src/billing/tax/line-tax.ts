import { roundHalfEven } from '../money/round'
import { taxRateFor } from './region-rates'

export type Line = { description: string; unitCents: number; quantity: number }

// Tax is worked out per line and rounded per line, so the invoice's tax always equals the sum of its lines' tax.
export function lineTaxCents(line: Line, region: string): number {
  return roundHalfEven(line.unitCents * line.quantity * taxRateFor(region))
}
