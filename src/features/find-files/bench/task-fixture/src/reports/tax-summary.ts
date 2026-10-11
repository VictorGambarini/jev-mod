import { query } from '../lib/db/pool'

export type TaxRow = { region: string; taxableCents: number; taxCents: number; effectiveRate: number }

// Tax collected per region for a month, with the fallback rate shown for comparison.
export async function taxSummary(month: string): Promise<{ rows: TaxRow[]; fallbackRate: number }> {
  const rows = await query<{ region: string; taxable: string; tax: string }>(
    `SELECT region, SUM(subtotal_cents) AS taxable, SUM(tax_cents) AS tax
       FROM invoices WHERE to_char(issued_at, 'YYYY-MM') = $1 GROUP BY region ORDER BY region`, [month])
  return {
    fallbackRate: parseFloat(process.env['TAX_RATE'] ?? '0.15'),
    rows: rows.map(r => ({
      region: r.region,
      taxableCents: Number(r.taxable),
      taxCents: Number(r.tax),
      effectiveRate: Number(r.taxable) ? Number(r.tax) / Number(r.taxable) : 0,
    })),
  }
}
