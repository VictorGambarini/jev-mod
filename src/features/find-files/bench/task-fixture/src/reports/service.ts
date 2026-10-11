import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishReportEvent } from './events'
import type { Report, NewReport } from './model'
import { fetchReports, findReport, insertReport, removeReport } from './repo'
import { validateReport } from './validators'
// Reports are built from a read replica, so a report can lag the invoices table by a few seconds.

export async function getReport(id: string): Promise<Report> {
  const found = await findReport(id)
  if (!found) throw notFound('report')
  return found
}

export async function listReports(options: { limit?: number; offset?: number } = {}): Promise<Report[]> {
  return fetchReports(options.limit, options.offset)
}

export async function createReport(input: NewReport): Promise<Report> {
  validateReport(input)
  const created = await insertReport(input)
  log.info('report created', { id: created.id })
  await publishReportEvent('created', created)
  return created
}

export async function deleteReport(id: string): Promise<void> {
  await getReport(id)
  await removeReport(id)
  await publishReportEvent('deleted', { id })
}
