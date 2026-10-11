import { writeCsv } from '../../lib/csv/write-csv'
import { isoDate } from '../../lib/dates'
import type { Customer } from '../model'

const HEADER = ['id', 'name', 'email', 'country', 'created', 'marketing_opt_in']

// The rows of the customers CSV export. Marketing opt-in is exported as yes/no, never the internal flag value.
export function customersCsv(customers: Customer[]): string {
  return writeCsv(HEADER, customers.map(c => [c.id, c.name, c.email, c.country, isoDate(c.createdAt), c.marketingOptIn ? 'yes' : 'no']))
}
