import PDFDocument from 'pdfkit'
import { formatMoney } from '../billing/money/format'

// The monthly revenue report as a PDF: one table row per region. Not for invoices (see billing/invoice/pdf).
export function revenueReportPdf(month: string, rows: { region: string; cents: number }[], currency: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.fontSize(18).text(`Revenue ${month}`).moveDown()
    for (const r of rows) doc.fontSize(11).text(`${r.region}: ${formatMoney(r.cents, currency)}`)
    doc.end()
  })
}
