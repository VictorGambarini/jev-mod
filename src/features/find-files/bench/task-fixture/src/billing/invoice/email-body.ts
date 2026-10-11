import { formatMoney } from '../money/format'

export function invoiceEmailBody(name: string, number: string, totalCents: number, currency: string, dueOn: string): string {
  return [
    `Hi ${name},`,
    '',
    `Your invoice ${number} for ${formatMoney(totalCents, currency)} is attached as a PDF and is due on ${dueOn}.`,
    '',
    'Thanks,',
    'Tillbox billing',
  ].join('\n')
}
