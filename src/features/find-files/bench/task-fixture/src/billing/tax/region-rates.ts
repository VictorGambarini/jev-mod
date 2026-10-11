import { defaultTaxRate } from './default-rate'

const RATES: Record<string, number> = { NZ: 0.15, AU: 0.1, GB: 0.2, DE: 0.19 }

export function taxRateFor(region: string): number {
  return RATES[region.toUpperCase()] ?? defaultTaxRate()
}
