// The rate used when an invoice's region has no rate of its own (see region-rates.ts).
export function defaultTaxRate(): number {
  const rate = Number(process.env.TAX_RATE ?? '0.15')
  if (!Number.isFinite(rate) || rate < 0 || rate >= 1) throw new Error(`TAX_RATE must be a fraction below 1, got ${process.env.TAX_RATE}`)
  return rate
}
