import { roundHalfEven } from '../money/round'

// Credit for the unused part of a billing period when a plan changes mid-cycle.
export function prorate(priceCents: number, daysUsed: number, daysInPeriod: number): number {
  return roundHalfEven(priceCents * (1 - daysUsed / daysInPeriod))
}
