import { badRequest } from '../../lib/errors'

// Reads the CSV a customer success manager uploads when moving customers in from another system.
export function parseCustomersCsv(text: string): { name: string; email: string; country: string }[] {
  const [head, ...lines] = text.trim().split(/\r?\n/)
  const cols = head!.split(',')
  for (const need of ['name', 'email', 'country']) if (!cols.includes(need)) throw badRequest(`the CSV needs a ${need} column`)
  return lines.map(l => {
    const cells = l.split(',')
    return { name: cells[cols.indexOf('name')]!, email: cells[cols.indexOf('email')]!, country: cells[cols.indexOf('country')]! }
  })
}
