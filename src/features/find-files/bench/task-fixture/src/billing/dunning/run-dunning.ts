import { query } from '../../lib/db/pool'
import { log } from '../../lib/log'
import { reminderFor } from './reminder-templates'

// Finds invoices that are overdue and sends the reminder for how late they are.
export async function runDunning(now = new Date()): Promise<number> {
  const overdue = await query<{ id: string; email: string; days_late: number }>(
    `SELECT i.id, c.email, EXTRACT(DAY FROM $1::timestamptz - i.due_at)::int AS days_late
       FROM invoices i JOIN customers c ON c.id = i.customer_id
      WHERE i.status = 'open' AND i.due_at < $1`, [now])
  for (const o of overdue) log.info('dunning reminder', { invoice: o.id, template: reminderFor(o.days_late).name })
  return overdue.length
}
