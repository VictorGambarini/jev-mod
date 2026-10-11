import { Router } from 'express'
import { customersCsv } from '../../customers/export/customers-csv'
import { listCustomers } from '../../customers/service'

export const customersExport = Router()

// GET /api/customers/export.csv, streamed as a download.
customersExport.get('/customers/export.csv', async (_req, res) => {
  const customers = await listCustomers({ limit: 100_000 })
  res.setHeader('content-type', 'text/csv; charset=utf-8')
  res.setHeader('content-disposition', 'attachment; filename="customers.csv"')
  res.send(customersCsv(customers))
})
