import PDFDocument from 'pdfkit'
import { formatMoney } from '../../money/format'
import { LAYOUT } from './layout'

export type InvoiceView = { number: string; customer: string; currency: string; lines: { description: string; totalCents: number }[]; totalCents: number }

// Turns an invoice into the bytes of its PDF.
export function renderInvoicePdf(invoice: InvoiceView): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: LAYOUT.margin })
    const chunks: Buffer[] = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.fontSize(LAYOUT.title).text(`Invoice ${invoice.number}`)
    doc.fontSize(LAYOUT.body).text(invoice.customer).moveDown()
    for (const line of invoice.lines) doc.text(`${line.description}    ${formatMoney(line.totalCents, invoice.currency)}`)
    doc.moveDown().fontSize(LAYOUT.title - 4).text(`Total ${formatMoney(invoice.totalCents, invoice.currency)}`)
    doc.end()
  })
}
