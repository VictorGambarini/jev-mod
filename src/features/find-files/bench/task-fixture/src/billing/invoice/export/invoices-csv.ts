import { writeCsv } from '../../../lib/csv/write-csv'

// The finance team's monthly invoice export.
export function invoicesCsv(rows: { number: string; customer: string; totalCents: number; status: string }[]): string {
  return writeCsv(['number', 'customer', 'total', 'status'], rows.map(r => [r.number, r.customer, (r.totalCents / 100).toFixed(2), r.status]))
}
