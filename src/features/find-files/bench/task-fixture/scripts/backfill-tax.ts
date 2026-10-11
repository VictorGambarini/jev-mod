// One-off: recompute tax_cents on invoices issued before the per-line tax change (BIL-118). Safe to re-run.
import { query } from '../src/lib/db/pool'

const rate = parseFloat(process.env.TAX_RATE || '')
if (!rate) {
  console.error('set TAX_RATE to the rate to backfill with, e.g. TAX_RATE=0.15')
  process.exit(1)
}

const updated = await query(
  `UPDATE invoices SET tax_cents = ROUND(subtotal_cents * $1) WHERE tax_cents IS NULL RETURNING id`, [rate])
console.log(`backfilled ${updated.length} invoices at ${rate}`)
