#!/usr/bin/env python3
"""Writes task-fixture/: tillbox, a mid-sized TypeScript billing and orders API, for the find-files task bench.

Run from this folder: python3 task-fixture-gen.py. The output is committed; the script is how it is made, and
it is deterministic. About 40 files are written by hand below (the ones the bench's tasks look for, and the
near-misses that share their words); the other ~300 are modules generated from templates (a dozen entities, each
with a model, repository, service, validators, events, routes and tests), so that finding something takes real search.
"""
import os, random, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "task-fixture")
files = {}

def put(path, text):
    files[path] = text.lstrip("\n")

# ---------------------------------------------------------------- the project's top level

put("package.json", """
{
  "name": "tillbox",
  "version": "3.8.2",
  "private": true,
  "description": "Billing, orders and webhooks for the Tillbox platform",
  "scripts": {
    "build": "tsc -p .",
    "dev": "tsx watch src/server.ts",
    "test": "vitest run",
    "lint": "eslint src tests scripts",
    "migrate": "tsx scripts/migrate.ts"
  },
  "dependencies": {
    "express": "^4.19.2",
    "pg": "^8.12.0",
    "pdfkit": "^0.15.0",
    "node-cron": "^3.0.3",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5",
    "tsx": "^4.16.2",
    "eslint": "^9.8.0"
  }
}
""")
put("tsconfig.json", """
{
  "compilerOptions": {
    "target": "es2022",
    "module": "nodenext",
    "strict": true,
    "outDir": "dist",
    "rootDir": ".",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src", "tests", "scripts"]
}
""")
put(".gitignore", "node_modules\ndist\n.env\ncoverage\n")
put(".env.example", """
# Copy to .env for local development.
DATABASE_URL=postgres://tillbox:tillbox@localhost:5432/tillbox
PORT=8080
LOG_LEVEL=info
# Sales tax applied when an invoice has no region rate (a fraction: 0.15 is 15%).
TAX_RATE=0.15
PAYMENT_PROVIDER_SECRET=changeme
WEBHOOK_SIGNING_SECRET=changeme
""")
put("docker-compose.yml", """
services:
  api:
    build: .
    ports: ["8080:8080"]
    environment:
      DATABASE_URL: postgres://tillbox:tillbox@db:5432/tillbox
      TAX_RATE: "0.15"
      LOG_LEVEL: debug
    depends_on: [db]
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: tillbox
      POSTGRES_PASSWORD: tillbox
""")
put("README.md", """
# tillbox

Billing, orders and webhooks for the Tillbox platform. Express and Postgres, TypeScript.

## Layout

- `src/billing`: invoices, tax, proration, dunning
- `src/payments`: the payment gateway client, refunds, disputes' payment side
- `src/webhooks`: webhooks we send to customers (`dispatcher/`) and webhooks the payment provider sends us (`inbound/`)
- `src/orders`, `src/customers`, `src/subscriptions`, `src/products`, `src/plans`, ...: the domain modules
- `src/http`: routes and middleware
- `src/jobs`: scheduled jobs
- `migrations/`: SQL migrations, applied in order by `npm run migrate`
- `docs/`: runbooks and the config reference

## Running it

    cp .env.example .env
    docker compose up db -d
    npm run migrate
    npm run dev

Tests: `npm test`. They use an in-memory repository, so no database is needed.

## Configuration

See `docs/config.md`. `TAX_RATE` is the fallback sales tax rate.
""")

# ---------------------------------------------------------------- shared libraries

put("src/lib/errors.ts", """
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
  }
}

export const notFound = (what: string) => new AppError(404, 'not_found', `${what} not found`)
export const badRequest = (message: string) => new AppError(400, 'bad_request', message)
export const conflict = (message: string) => new AppError(409, 'conflict', message)
""")
put("src/lib/log.ts", """
type Fields = Record<string, unknown>

const level = process.env.LOG_LEVEL ?? 'info'

function write(kind: string, message: string, fields: Fields = {}) {
  console.log(JSON.stringify({ at: new Date().toISOString(), kind, message, ...fields }))
}

export const log = {
  debug: (m: string, f?: Fields) => { if (level === 'debug') write('debug', m, f) },
  info: (m: string, f?: Fields) => write('info', m, f),
  warn: (m: string, f?: Fields) => write('warn', m, f),
  error: (m: string, f?: Fields) => write('error', m, f),
}
""")
put("src/lib/ids.ts", """
import { randomUUID } from 'node:crypto'

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`
""")
put("src/lib/dates.ts", """
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000)
export const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
export const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000)
export const isoDate = (d: Date) => d.toISOString().slice(0, 10)
""")
put("src/lib/db/pool.ts", """
import { Pool } from 'pg'

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })

export const query = <T = unknown>(text: string, params: unknown[] = []) => pool.query(text, params).then(r => r.rows as T[])
""")
put("src/lib/db/with-retry.ts", """
import { log } from '../log'

// Re-runs a database call that failed with a serialization failure or a deadlock (SQLSTATE 40001 / 40P01).
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (error) {
      const code = (error as { code?: string }).code
      if ((code !== '40001' && code !== '40P01') || i >= attempts) throw error
      log.warn('retrying transaction', { attempt: i, code })
    }
  }
}
""")
put("src/lib/csv/write-csv.ts", """
// Writes rows as RFC 4180 CSV. Shared by every export in the app.
export function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\\n\\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function writeCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\\r\\n') + '\\r\\n'
}
""")
put("src/lib/http/retrying-fetch.ts", """
import { log } from '../log'

// fetch() that retries network errors and 502/503/504 a couple of times, for our own internal service calls.
export async function retryingFetch(url: string, init: RequestInit = {}, retries = 2): Promise<Response> {
  let last: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, init)
      if (![502, 503, 504].includes(res.status)) return res
      last = new Error(`upstream said ${res.status}`)
    } catch (error) {
      last = error
    }
    log.warn('internal call failed, retrying', { url, attempt: i + 1 })
    await new Promise(r => setTimeout(r, 200 * (i + 1)))
  }
  throw last
}
""")

# ---------------------------------------------------------------- config

put("src/config/env.ts", """
import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(8080),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PAYMENT_PROVIDER_SECRET: z.string().min(8),
  WEBHOOK_SIGNING_SECRET: z.string().min(8),
})

export const env = schema.parse(process.env)
""")
put("src/config/flags.ts", """
// Feature flags, read once at start-up. Set FLAG_<NAME>=1 to turn one on.
const on = (name: string) => process.env[`FLAG_${name}`] === '1'

export const flags = {
  newCheckout: on('NEW_CHECKOUT'),
  cashRounding: on('CASH_ROUNDING'),
  dunningEmails: on('DUNNING_EMAILS'),
}
""")
put("src/config/regions.ts", """
export type Region = { code: string; currency: string; taxName: string }

export const REGIONS: Region[] = [
  { code: 'NZ', currency: 'NZD', taxName: 'GST' },
  { code: 'AU', currency: 'AUD', taxName: 'GST' },
  { code: 'GB', currency: 'GBP', taxName: 'VAT' },
  { code: 'DE', currency: 'EUR', taxName: 'MwSt' },
  { code: 'US', currency: 'USD', taxName: 'Sales tax' },
]

export const regionOf = (code: string) => REGIONS.find(r => r.code === code.toUpperCase())
""")

# ---------------------------------------------------------------- billing: tax (task 3)

put("src/billing/tax/default-rate.ts", """
// The rate used when an invoice's region has no rate of its own (see region-rates.ts).
export function defaultTaxRate(): number {
  const rate = Number(process.env.TAX_RATE ?? '0.15')
  if (!Number.isFinite(rate) || rate < 0 || rate >= 1) throw new Error(`TAX_RATE must be a fraction below 1, got ${process.env.TAX_RATE}`)
  return rate
}
""")
put("src/billing/tax/region-rates.ts", """
import { defaultTaxRate } from './default-rate'

const RATES: Record<string, number> = { NZ: 0.15, AU: 0.1, GB: 0.2, DE: 0.19 }

export function taxRateFor(region: string): number {
  return RATES[region.toUpperCase()] ?? defaultTaxRate()
}
""")
put("src/billing/tax/line-tax.ts", """
import { roundHalfEven } from '../money/round'
import { taxRateFor } from './region-rates'

export type Line = { description: string; unitCents: number; quantity: number }

// Tax is worked out per line and rounded per line, so the invoice's tax always equals the sum of its lines' tax.
export function lineTaxCents(line: Line, region: string): number {
  return roundHalfEven(line.unitCents * line.quantity * taxRateFor(region))
}
""")
put("src/admin/tax-override.ts", """
import { log } from '../lib/log'

// Support can set TAX_RATE_OVERRIDE on a single instance to bill a customer under a negotiated rate while a fix ships.
export function taxOverride(): number | null {
  const raw = process.env.TAX_RATE_OVERRIDE
  if (!raw) return null
  const rate = Number(raw)
  if (!Number.isFinite(rate)) {
    log.warn('ignoring a TAX_RATE_OVERRIDE that is not a number', { raw })
    return null
  }
  return rate
}
""")
put("src/reports/tax-summary.ts", """
import { query } from '../lib/db/pool'

export type TaxRow = { region: string; taxableCents: number; taxCents: number; effectiveRate: number }

// Tax collected per region for a month, with the fallback rate shown for comparison.
export async function taxSummary(month: string): Promise<{ rows: TaxRow[]; fallbackRate: number }> {
  const rows = await query<{ region: string; taxable: string; tax: string }>(
    `SELECT region, SUM(subtotal_cents) AS taxable, SUM(tax_cents) AS tax
       FROM invoices WHERE to_char(issued_at, 'YYYY-MM') = $1 GROUP BY region ORDER BY region`, [month])
  return {
    fallbackRate: parseFloat(process.env['TAX_RATE'] ?? '0.15'),
    rows: rows.map(r => ({
      region: r.region,
      taxableCents: Number(r.taxable),
      taxCents: Number(r.tax),
      effectiveRate: Number(r.taxable) ? Number(r.tax) / Number(r.taxable) : 0,
    })),
  }
}
""")
put("scripts/backfill-tax.ts", """
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
""")
put("scripts/migrate.ts", """
import { readdir, readFile } from 'node:fs/promises'
import { pool } from '../src/lib/db/pool'

const dir = new URL('../migrations/', import.meta.url).pathname
await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())')
const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map(r => r.name))
for (const name of (await readdir(dir)).sort()) {
  if (done.has(name)) continue
  await pool.query(await readFile(dir + name, 'utf8'))
  await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name])
  console.log('applied', name)
}
await pool.end()
""")
put("tests/billing/tax.spec.ts", """
import { afterEach, expect, test } from 'vitest'
import { defaultTaxRate } from '../../src/billing/tax/default-rate'
import { taxRateFor } from '../../src/billing/tax/region-rates'

afterEach(() => { delete process.env.TAX_RATE })

test('a region with its own rate ignores TAX_RATE', () => {
  process.env.TAX_RATE = '0.5'
  expect(taxRateFor('NZ')).toBe(0.15)
})

test('an unknown region falls back to TAX_RATE', () => {
  process.env.TAX_RATE = '0.07'
  expect(taxRateFor('XX')).toBe(0.07)
})

test('a rate of 100% or more is refused', () => {
  process.env.TAX_RATE = '1.2'
  expect(() => defaultTaxRate()).toThrow()
})
""")

# ---------------------------------------------------------------- billing: money and invoice (task 2, 6)

put("src/billing/money/round.ts", """
// Rounds a number of cents to a whole cent, halves to the even neighbour (banker's rounding).
export function roundHalfEven(cents: number): number {
  const floor = Math.floor(cents)
  const diff = cents - floor
  if (diff < 0.5) return floor
  if (diff > 0.5) return floor + 1
  return floor % 2 === 0 ? floor : floor + 1
}
""")
put("src/billing/money/format.ts", """
export function formatMoney(cents: number, currency: string, locale = 'en-NZ'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
}
""")
put("src/billing/invoice/rounding.ts", """
import { REGIONS } from '../../config/regions'
import { flags } from '../../config/flags'

// Cash rounding: NZD and AUD have no 1c or 2c coins, so an invoice paid in cash is rounded to the nearest 5c.
// Every other currency, and every card payment, keeps the exact total.
const FIVE_CENT_CURRENCIES = new Set(REGIONS.filter(r => r.code === 'NZ' || r.code === 'AU').map(r => r.currency))

export function roundInvoiceTotal(totalCents: number, currency: string, paidInCash: boolean): number {
  if (!flags.cashRounding || !paidInCash || !FIVE_CENT_CURRENCIES.has(currency)) return totalCents
  return Math.round(totalCents / 5) * 5
}
""")
put("src/billing/invoice/total.ts", """
import { lineTaxCents, type Line } from '../tax/line-tax'
import { roundInvoiceTotal } from './rounding'

export type Totals = { subtotalCents: number; taxCents: number; totalCents: number }

export function invoiceTotals(lines: Line[], region: string, currency: string, paidInCash = false): Totals {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitCents * l.quantity, 0)
  const taxCents = lines.reduce((sum, l) => sum + lineTaxCents(l, region), 0)
  return { subtotalCents, taxCents, totalCents: roundInvoiceTotal(subtotalCents + taxCents, currency, paidInCash) }
}
""")
put("src/billing/invoice/email-body.ts", """
import { formatMoney } from '../money/format'

export function invoiceEmailBody(name: string, number: string, totalCents: number, currency: string, dueOn: string): string {
  return [
    `Hi ${name},`,
    '',
    `Your invoice ${number} for ${formatMoney(totalCents, currency)} is attached as a PDF and is due on ${dueOn}.`,
    '',
    'Thanks,',
    'Tillbox billing',
  ].join('\\n')
}
""")
put("src/billing/invoice/pdf/render-invoice-pdf.ts", """
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
""")
put("src/billing/invoice/pdf/layout.ts", """
export const LAYOUT = { margin: 48, title: 20, body: 11, footer: 8 }
""")
put("src/reports/pdf-export.ts", """
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
""")
put("src/reports/format-currency.ts", """
// Display helper for report tables: rounds to whole dollars for the executive summary.
export const wholeDollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-NZ')}`
""")
put("src/billing/invoice/proration.ts", """
import { roundHalfEven } from '../money/round'

// Credit for the unused part of a billing period when a plan changes mid-cycle.
export function prorate(priceCents: number, daysUsed: number, daysInPeriod: number): number {
  return roundHalfEven(priceCents * (1 - daysUsed / daysInPeriod))
}
""")

# ---------------------------------------------------------------- billing: dunning and jobs (task 7)

put("src/billing/dunning/run-dunning.ts", """
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
""")
put("src/billing/dunning/reminder-templates.ts", """
export type Reminder = { name: string; subject: string }

export function reminderFor(daysLate: number): Reminder {
  if (daysLate < 7) return { name: 'friendly', subject: 'A reminder about your invoice' }
  if (daysLate < 30) return { name: 'firm', subject: 'Your invoice is overdue' }
  return { name: 'final', subject: 'Final notice: overdue invoice' }
}
""")
put("src/jobs/schedules.ts", """
import cron from 'node-cron'
import { runDunning } from '../billing/dunning/run-dunning'
import { expireStaleKeys } from '../admin/apikeys/expire-stale'
import { sweepDeliveries } from '../webhooks/dispatcher/sweep'
import { log } from '../lib/log'

// Every scheduled job in the app, in one place. Times are UTC.
export function startSchedules() {
  const every = (name: string, expr: string, fn: () => Promise<unknown>) =>
    cron.schedule(expr, () => fn().catch(error => log.error(`job ${name} failed`, { error: String(error) })), { timezone: 'UTC' })

  every('dunning', '0 2 * * *', () => runDunning())
  every('expire-api-keys', '15 3 * * *', () => expireStaleKeys())
  every('webhook-sweep', '*/5 * * * *', () => sweepDeliveries())
}
""")
put("src/jobs/runner.ts", """
import { log } from '../lib/log'

// Runs one named job now, for `npm run job -- <name>` and the admin "run now" button.
export async function runJob(name: string, jobs: Record<string, () => Promise<unknown>>) {
  const job = jobs[name]
  if (!job) throw new Error(`no job called ${name}`)
  const started = Date.now()
  await job()
  log.info('job finished', { name, ms: Date.now() - started })
}
""")
put("src/jobs/queue/backoff.ts", """
// Delay before a failed background job is run again: 30s, 2m, 10m, then every hour, with up to 20% jitter.
const STEPS_MS = [30_000, 120_000, 600_000]

export function jobBackoffMs(attempt: number, random = Math.random): number {
  const base = STEPS_MS[attempt - 1] ?? 3_600_000
  return Math.round(base * (1 + random() * 0.2))
}
""")

# ---------------------------------------------------------------- webhooks (tasks 1, 9)

put("src/webhooks/dispatcher/retry-policy.ts", """
// When a delivery to a customer's endpoint is tried again after it failed.
// Attempt 1 is the first try; a delivery gets MAX_ATTEMPTS in all, then is parked as "failed" for a person to replay.
export const MAX_ATTEMPTS = 8

const SCHEDULE_SECONDS = [30, 120, 600, 1800, 7200, 21_600, 86_400]

export function nextAttemptDelaySeconds(failedAttempt: number): number | null {
  if (failedAttempt >= MAX_ATTEMPTS) return null
  return SCHEDULE_SECONDS[failedAttempt - 1] ?? 86_400
}

// A 4xx other than 408/429 means the customer's endpoint rejected the event itself; trying again will not help.
export function shouldRetry(status: number | null): boolean {
  if (status === null) return true
  if (status === 408 || status === 429) return true
  return status >= 500
}
""")
put("src/webhooks/dispatcher/dispatcher.ts", """
import { newId } from '../../lib/ids'
import { log } from '../../lib/log'
import { nextAttemptDelaySeconds, shouldRetry } from './retry-policy'
import { signBody } from './sign'
import { saveAttempt } from './delivery-store'

export type Delivery = { id: string; endpointUrl: string; event: string; body: string; attempt: number }

export async function deliver(d: Delivery): Promise<void> {
  const signature = signBody(d.body, process.env.WEBHOOK_SIGNING_SECRET!)
  let status: number | null = null
  try {
    const res = await fetch(d.endpointUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'tillbox-signature': signature, 'tillbox-event': d.event },
      body: d.body,
      signal: AbortSignal.timeout(10_000),
    })
    status = res.status
  } catch (error) {
    log.warn('webhook delivery failed to connect', { id: d.id, error: String(error) })
  }
  const ok = status !== null && status < 300
  const delay = ok || !shouldRetry(status) ? null : nextAttemptDelaySeconds(d.attempt)
  await saveAttempt(d.id, d.attempt, status, delay === null ? null : new Date(Date.now() + delay * 1000))
}

export const newDelivery = (endpointUrl: string, event: string, payload: unknown): Delivery =>
  ({ id: newId('dlv'), endpointUrl, event, body: JSON.stringify(payload), attempt: 1 })
""")
put("src/webhooks/dispatcher/sign.ts", """
import { createHmac } from 'node:crypto'

// Signs a webhook body that we send to a customer, so they can check it came from us.
export function signBody(body: string, secret: string, now = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac('sha256', secret).update(`${now}.${body}`).digest('hex')
  return `t=${now},v1=${mac}`
}
""")
put("src/webhooks/dispatcher/delivery-store.ts", """
import { query } from '../../lib/db/pool'

export async function saveAttempt(id: string, attempt: number, status: number | null, retryAt: Date | null) {
  await query(
    `UPDATE webhook_deliveries SET attempt = $2, last_status = $3, retry_at = $4, state = $5 WHERE id = $1`,
    [id, attempt + 1, status, retryAt, retryAt ? 'pending' : status !== null && status < 300 ? 'delivered' : 'failed'])
}
""")
put("src/webhooks/dispatcher/sweep.ts", """
import { query } from '../../lib/db/pool'
import { deliver } from './dispatcher'

// Picks up deliveries whose retry time has come.
export async function sweepDeliveries(): Promise<number> {
  const due = await query<{ id: string; endpoint_url: string; event: string; body: string; attempt: number }>(
    `SELECT id, endpoint_url, event, body, attempt FROM webhook_deliveries WHERE state = 'pending' AND retry_at <= now() LIMIT 200`)
  await Promise.all(due.map(d => deliver({ id: d.id, endpointUrl: d.endpoint_url, event: d.event, body: d.body, attempt: d.attempt })))
  return due.length
}
""")
put("src/webhooks/inbound/verify-signature.ts", """
import { createHmac, timingSafeEqual } from 'node:crypto'
import { AppError } from '../../lib/errors'

const TOLERANCE_SECONDS = 300

// Checks the signature header on a webhook the payment provider sent us ("t=<unix>,v1=<hex hmac>").
// Throws 401 when it is missing, malformed, too old or does not match the raw body.
export function verifyProviderSignature(rawBody: Buffer, header: string | undefined, secret: string, now = Math.floor(Date.now() / 1000)): void {
  if (!header) throw new AppError(401, 'missing_signature', 'no signature header')
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=') as [string, string]))
  const t = Number(parts.t)
  if (!parts.v1 || !Number.isFinite(t)) throw new AppError(401, 'bad_signature', 'malformed signature header')
  if (Math.abs(now - t) > TOLERANCE_SECONDS) throw new AppError(401, 'stale_signature', 'signature timestamp too old')
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody.toString('utf8')}`).digest()
  const given = Buffer.from(parts.v1, 'hex')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new AppError(401, 'bad_signature', 'signature does not match')
}
""")
put("src/webhooks/inbound/replay-guard.ts", """
import { query } from '../../lib/db/pool'

// The provider may send the same event more than once; handle each event id once.
export async function firstTimeSeen(eventId: string): Promise<boolean> {
  const rows = await query(`INSERT INTO provider_events (id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id`, [eventId])
  return rows.length === 1
}
""")
put("src/webhooks/inbound/router.ts", """
import { Router } from 'express'
import { env } from '../../config/env'
import { rawBody } from '../../http/middleware/raw-body'
import { firstTimeSeen } from './replay-guard'
import { verifyProviderSignature } from './verify-signature'
import { onPaymentSucceeded } from './handlers/payment-succeeded'
import { onDisputeOpened } from './handlers/dispute-opened'

export const inbound = Router()

inbound.post('/webhooks/provider', rawBody, async (req, res) => {
  verifyProviderSignature(req.body as Buffer, req.header('provider-signature'), env.PAYMENT_PROVIDER_SECRET)
  const event = JSON.parse((req.body as Buffer).toString('utf8'))
  if (await firstTimeSeen(event.id)) {
    if (event.type === 'payment.succeeded') await onPaymentSucceeded(event)
    if (event.type === 'dispute.opened') await onDisputeOpened(event)
  }
  res.status(204).end()
})
""")
put("src/webhooks/inbound/handlers/payment-succeeded.ts", """
import { query } from '../../../lib/db/pool'

export async function onPaymentSucceeded(event: { data: { invoiceId: string; amountCents: number } }) {
  await query(`UPDATE invoices SET status = 'paid', paid_at = now() WHERE id = $1`, [event.data.invoiceId])
}
""")
put("src/webhooks/inbound/handlers/dispute-opened.ts", """
import { openDispute } from '../../../disputes/open-dispute'

export async function onDisputeOpened(event: { data: { paymentId: string; reason: string } }) {
  await openDispute(event.data.paymentId, event.data.reason)
}
""")
put("src/http/middleware/raw-body.ts", """
import express from 'express'

// Keeps the request body as bytes: the provider's signature is computed over exactly what was sent.
export const rawBody = express.raw({ type: 'application/json', limit: '1mb' })
""")

# ---------------------------------------------------------------- payments (task 4)

put("src/payments/gateway/client.ts", """
import { env } from '../../config/env'

export async function gatewayPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.payprovider.example/v2${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.PAYMENT_PROVIDER_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw Object.assign(new Error(`gateway ${path} answered ${res.status}`), { status: res.status })
  return res.json() as Promise<T>
}
""")
put("src/payments/gateway/retry.ts", """
import { log } from '../../lib/log'

// Calls to the payment gateway are retried on timeouts and 5xx with exponential backoff (250ms, 500ms, 1s), using
// the same idempotency key so a retry can never charge twice.
export async function withGatewayRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let delay = 250
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (error) {
      const status = (error as { status?: number }).status
      if (i >= attempts || (status !== undefined && status < 500)) throw error
      log.warn('gateway call failed, retrying', { attempt: i, status })
      await new Promise(r => setTimeout(r, delay))
      delay *= 2
    }
  }
}
""")
put("src/payments/refunds.ts", """
import { gatewayPost } from './gateway/client'
import { withGatewayRetry } from './gateway/retry'
import { canRefundPayment } from './refund-policy'
import { query } from '../lib/db/pool'
import { conflict } from '../lib/errors'

export type Refund = { id: string; paymentId: string; amountCents: number; reason: string }

// Refunds a captured payment, in full or in part, and records it. The one place refunds are made.
export async function refundPayment(paymentId: string, amountCents: number, reason: string): Promise<Refund> {
  const [payment] = await query<{ captured_cents: number; refunded_cents: number }>(
    `SELECT captured_cents, refunded_cents FROM payments WHERE id = $1`, [paymentId])
  if (!payment || !canRefundPayment(payment.captured_cents, payment.refunded_cents, amountCents)) throw conflict('this payment cannot be refunded by that much')
  const refund = await withGatewayRetry(() => gatewayPost<Refund>('/refunds', { payment: paymentId, amount: amountCents, reason }))
  await query(`UPDATE payments SET refunded_cents = refunded_cents + $2 WHERE id = $1`, [paymentId, amountCents])
  return refund
}
""")
put("src/payments/refund-policy.ts", """
// A payment can be refunded while the total refunded stays within what was captured.
export function canRefundPayment(capturedCents: number, refundedCents: number, wantedCents: number): boolean {
  return wantedCents > 0 && refundedCents + wantedCents <= capturedCents
}
""")
put("src/orders/cancel-order.ts", """
import { query } from '../lib/db/pool'
import { notFound } from '../lib/errors'
import { refundPayment } from '../payments/refunds'

// Cancels an order that has not shipped and gives the money back.
export async function cancelOrder(orderId: string, reason: string): Promise<void> {
  const [order] = await query<{ payment_id: string; total_cents: number; shipped_at: Date | null }>(
    `SELECT payment_id, total_cents, shipped_at FROM orders WHERE id = $1`, [orderId])
  if (!order) throw notFound('order')
  if (order.shipped_at) throw new Error('shipped orders are returned, not cancelled')
  await refundPayment(order.payment_id, order.total_cents, `order cancelled: ${reason}`)
  await query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [orderId])
}
""")
put("src/support/admin/refund-controller.ts", """
import type { Request, Response } from 'express'
import { refundPayment } from '../../payments/refunds'
import { badRequest } from '../../lib/errors'

// POST /admin/payments/:id/refund, for support staff.
export async function refundController(req: Request, res: Response) {
  const amount = Number(req.body.amountCents)
  if (!Number.isInteger(amount) || amount <= 0) throw badRequest('amountCents must be a positive whole number')
  const refund = await refundPayment(req.params.id!, amount, String(req.body.reason ?? 'support refund'))
  res.status(201).json(refund)
}
""")
put("src/disputes/open-dispute.ts", """
import { query } from '../lib/db/pool'
import { newId } from '../lib/ids'

export async function openDispute(paymentId: string, reason: string): Promise<string> {
  const id = newId('dsp')
  await query(`INSERT INTO disputes (id, payment_id, reason, state) VALUES ($1, $2, $3, 'open')`, [id, paymentId, reason])
  return id
}
""")
put("src/disputes/auto-resolve.ts", """
import { query } from '../lib/db/pool'
import { log } from '../lib/log'
import { refundPayment } from '../payments/refunds'

// Disputes under $25 are cheaper to refund than to contest, so we refund them and close the dispute.
const AUTO_REFUND_BELOW_CENTS = 2500

export async function autoResolve(disputeId: string): Promise<boolean> {
  const [d] = await query<{ payment_id: string; amount_cents: number }>(`SELECT payment_id, amount_cents FROM disputes WHERE id = $1`, [disputeId])
  if (!d || d.amount_cents >= AUTO_REFUND_BELOW_CENTS) return false
  await refundPayment(d.payment_id, d.amount_cents, 'auto-resolved dispute')
  await query(`UPDATE disputes SET state = 'resolved_refunded' WHERE id = $1`, [disputeId])
  log.info('dispute auto-resolved', { disputeId })
  return true
}
""")
put("src/subscriptions/cancel-subscription.ts", """
import { query } from '../lib/db/pool'
import { prorate } from '../billing/invoice/proration'

// Cancels at the end of the period, or now with a prorated credit when `immediately` is set.
export async function cancelSubscription(id: string, immediately: boolean): Promise<void> {
  if (!immediately) {
    await query(`UPDATE subscriptions SET cancel_at_period_end = true WHERE id = $1`, [id])
    return
  }
  const [s] = await query<{ price_cents: number; days_used: number; days_in_period: number }>(
    `SELECT price_cents, days_used, days_in_period FROM subscription_periods WHERE subscription_id = $1`, [id])
  if (s) await refundPaymentLater(id, prorate(s.price_cents, s.days_used, s.days_in_period))
  await query(`UPDATE subscriptions SET status = 'cancelled' WHERE id = $1`, [id])
}

// Queues the credit for the nightly batch instead of refunding straight away.
async function refundPaymentLater(subscriptionId: string, cents: number): Promise<void> {
  await query(`INSERT INTO pending_credits (subscription_id, cents) VALUES ($1, $2)`, [subscriptionId, cents])
}
""")
put("src/support/admin/refund-limits.ts", """
// Support agents may refund up to this much without a second approval.
export const AGENT_REFUND_LIMIT_CENTS = 20_000

export const needsApproval = (amountCents: number) => amountCents > AGENT_REFUND_LIMIT_CENTS
""")
put("tests/payments/refunds.spec.ts", """
import { expect, test, vi } from 'vitest'
import { refundPayment } from '../../src/payments/refunds'

vi.mock('../../src/lib/db/pool', () => ({ query: vi.fn().mockResolvedValue([{ captured_cents: 5000, refunded_cents: 0 }]) }))
vi.mock('../../src/payments/gateway/client', () => ({ gatewayPost: vi.fn().mockResolvedValue({ id: 'rf_1', paymentId: 'pay_1', amountCents: 1000, reason: 'x' }) }))

test('refunds part of a payment', async () => {
  const refund = await refundPayment('pay_1', 1000, 'customer asked')
  expect(refund.id).toBe('rf_1')
})

test('refuses more than was captured', async () => {
  await expect(refundPayment('pay_1', 9000, 'too much')).rejects.toThrow()
})
""")
put("tests/orders/cancel-order.spec.ts", """
import { expect, test, vi } from 'vitest'
import { cancelOrder } from '../../src/orders/cancel-order'
import { refundPayment } from '../../src/payments/refunds'

vi.mock('../../src/payments/refunds', () => ({ refundPayment: vi.fn() }))
vi.mock('../../src/lib/db/pool', () => ({ query: vi.fn().mockResolvedValue([{ payment_id: 'pay_9', total_cents: 4200, shipped_at: null }]) }))

test('cancelling an unshipped order refunds its payment in full', async () => {
  await cancelOrder('ord_1', 'changed my mind')
  expect(refundPayment).toHaveBeenCalledWith('pay_9', 4200, 'order cancelled: changed my mind')
})
""")

# ---------------------------------------------------------------- http and auth (task 5)

put("src/http/middleware/api-key-auth.ts", """
import type { NextFunction, Request, Response } from 'express'
import { findKey } from '../../auth/apikeys/store'
import { AppError } from '../../lib/errors'

// Authenticates machine clients: `Authorization: Bearer tbk_...`. An expired key is a 401 with code api_key_expired,
// so integrations can tell it apart from a wrong key and rotate it.
export async function apiKeyAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.header('authorization')?.replace(/^Bearer /, '')
  if (!token?.startsWith('tbk_')) throw new AppError(401, 'unauthorized', 'an API key is required')
  const key = await findKey(token)
  if (!key) throw new AppError(401, 'unauthorized', 'unknown API key')
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) throw new AppError(401, 'api_key_expired', 'this API key has expired')
  Object.assign(req, { accountId: key.accountId })
  next()
}
""")
put("src/http/middleware/session-auth.ts", """
import type { NextFunction, Request, Response } from 'express'
import { readSession } from '../../auth/session'
import { AppError } from '../../lib/errors'

// Authenticates people using the dashboard, from the session cookie. Sessions expire after 12 hours idle.
export async function sessionAuth(req: Request, _res: Response, next: NextFunction) {
  const session = await readSession(req.headers.cookie)
  if (!session) throw new AppError(401, 'unauthorized', 'sign in first')
  if (session.idleSeconds > 12 * 3600) throw new AppError(401, 'session_expired', 'your session expired')
  Object.assign(req, { accountId: session.accountId })
  next()
}
""")
put("src/http/middleware/rate-limit.ts", """
import type { NextFunction, Request, Response } from 'express'

const hits = new Map<string, { count: number; resetAt: number }>()

// 600 requests a minute per account.
export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const who = String((req as unknown as { accountId?: string }).accountId ?? req.ip)
  const now = Date.now()
  const h = hits.get(who) && hits.get(who)!.resetAt > now ? hits.get(who)! : { count: 0, resetAt: now + 60_000 }
  h.count++
  hits.set(who, h)
  if (h.count > 600) return res.status(429).json({ code: 'rate_limited' })
  next()
}
""")
put("src/auth/session.ts", """
export type Session = { accountId: string; idleSeconds: number }

export async function readSession(cookie: string | undefined): Promise<Session | null> {
  const m = /tbsid=([a-f0-9]{32})/.exec(cookie ?? '')
  if (!m) return null
  return { accountId: 'acct_demo', idleSeconds: 0 }
}
""")
put("src/auth/token/expiry.ts", """
// Short-lived JWTs for the dashboard's websocket: valid for 15 minutes, with 30 seconds of clock skew allowed.
export const TOKEN_TTL_SECONDS = 900
const SKEW_SECONDS = 30

export function isTokenExpired(expSeconds: number, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return nowSeconds > expSeconds + SKEW_SECONDS
}
""")
put("src/auth/apikeys/store.ts", """
import { query } from '../../lib/db/pool'

export type ApiKey = { accountId: string; expiresAt: Date | null }

export async function findKey(token: string): Promise<ApiKey | null> {
  const [row] = await query<{ account_id: string; expires_at: Date | null }>(
    `SELECT account_id, expires_at FROM api_keys WHERE token_hash = encode(sha256($1::bytea), 'hex') AND revoked_at IS NULL`, [token])
  return row ? { accountId: row.account_id, expiresAt: row.expires_at } : null
}
""")
put("src/admin/apikeys/expire-stale.ts", """
import { query } from '../../lib/db/pool'

// Nightly: API keys unused for 180 days get an expiry date a week out, so integrations have time to notice.
export async function expireStaleKeys(): Promise<number> {
  const rows = await query(
    `UPDATE api_keys SET expires_at = now() + interval '7 days'
      WHERE expires_at IS NULL AND last_used_at < now() - interval '180 days' RETURNING id`)
  return rows.length
}
""")
put("src/http/server.ts", """
import express from 'express'
import { env } from '../config/env'
import { startSchedules } from '../jobs/schedules'
import { inbound } from '../webhooks/inbound/router'
import { apiKeyAuth } from './middleware/api-key-auth'
import { rateLimit } from './middleware/rate-limit'
import { routes } from './routes'

const app = express()
app.use(inbound)
app.use(express.json())
app.use('/api', apiKeyAuth, rateLimit, routes)
startSchedules()
app.listen(env.PORT)
""")

# ---------------------------------------------------------------- customers export (task 10)

put("src/customers/export/customers-csv.ts", """
import { writeCsv } from '../../lib/csv/write-csv'
import { isoDate } from '../../lib/dates'
import type { Customer } from '../model'

const HEADER = ['id', 'name', 'email', 'country', 'created', 'marketing_opt_in']

// The rows of the customers CSV export. Marketing opt-in is exported as yes/no, never the internal flag value.
export function customersCsv(customers: Customer[]): string {
  return writeCsv(HEADER, customers.map(c => [c.id, c.name, c.email, c.country, isoDate(c.createdAt), c.marketingOptIn ? 'yes' : 'no']))
}
""")
put("src/http/routes/customers-export.ts", """
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
""")
put("src/customers/import/customers-csv-import.ts", """
import { badRequest } from '../../lib/errors'

// Reads the CSV a customer success manager uploads when moving customers in from another system.
export function parseCustomersCsv(text: string): { name: string; email: string; country: string }[] {
  const [head, ...lines] = text.trim().split(/\\r?\\n/)
  const cols = head!.split(',')
  for (const need of ['name', 'email', 'country']) if (!cols.includes(need)) throw badRequest(`the CSV needs a ${need} column`)
  return lines.map(l => {
    const cells = l.split(',')
    return { name: cells[cols.indexOf('name')]!, email: cells[cols.indexOf('email')]!, country: cells[cols.indexOf('country')]! }
  })
}
""")
put("src/billing/invoice/export/invoices-csv.ts", """
import { writeCsv } from '../../../lib/csv/write-csv'

// The finance team's monthly invoice export.
export function invoicesCsv(rows: { number: string; customer: string; totalCents: number; status: string }[]): string {
  return writeCsv(['number', 'customer', 'total', 'status'], rows.map(r => [r.number, r.customer, (r.totalCents / 100).toFixed(2), r.status]))
}
""")
put("src/http/routes/index.ts", """
import { Router } from 'express'
import { customersExport } from './customers-export'

export const routes = Router()
routes.use(customersExport)
""")

# ---------------------------------------------------------------- docs

put("docs/config.md", """
# Configuration

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | none | Postgres connection string |
| `PORT` | 8080 | HTTP port |
| `LOG_LEVEL` | info | debug, info, warn or error |
| `TAX_RATE` | 0.15 | Fallback sales tax rate for regions without a rate of their own |
| `PAYMENT_PROVIDER_SECRET` | none | Secret for calls to the payment gateway and for verifying its webhooks |
| `WEBHOOK_SIGNING_SECRET` | none | Secret used to sign webhooks we send to customers |
| `FLAG_CASH_ROUNDING` | off | Round cash-paid NZD and AUD invoices to the nearest 5c |
""")
put("docs/runbooks/dunning.md", """
# Runbook: dunning

The dunning job runs nightly and sends reminders for overdue invoices. If reminders stopped, check the job log for
`job dunning failed`, then run `npm run job -- dunning` by hand.
""")
put("docs/runbooks/webhooks.md", """
# Runbook: webhooks

A delivery that fails eight times is parked as `failed`. Support can replay it from the admin page. If many deliveries
are pending, check the sweep job; refund and dispute events come in through `/webhooks/provider`.
""")
put("docs/runbooks/refunds.md", """
# Runbook: refunds

Support refunds from the admin page (limit $200 without approval). Orders cancelled before shipping are refunded
automatically, and disputes under $25 are auto-refunded. A refund that the gateway rejected is safe to retry.
""")

# ---------------------------------------------------------------- migrations (task 8)

MIGRATIONS = [
    ("0001_create_customers", "CREATE TABLE customers (\n  id text PRIMARY KEY,\n  name text NOT NULL,\n  email text NOT NULL UNIQUE,\n  country text NOT NULL,\n  created_at timestamptz NOT NULL DEFAULT now()\n);"),
    ("0002_create_products", "CREATE TABLE products (\n  id text PRIMARY KEY,\n  sku text NOT NULL UNIQUE,\n  name text NOT NULL,\n  price_cents integer NOT NULL\n);"),
    ("0003_create_invoices", "CREATE TABLE invoices (\n  id text PRIMARY KEY,\n  customer_id text NOT NULL,\n  number text NOT NULL UNIQUE,\n  status text NOT NULL DEFAULT 'open',\n  subtotal_cents integer NOT NULL,\n  tax_cents integer,\n  issued_at timestamptz NOT NULL DEFAULT now(),\n  due_at timestamptz NOT NULL\n);"),
    ("0004_create_orders", "CREATE TABLE orders (\n  id text PRIMARY KEY,\n  customer_id text NOT NULL,\n  payment_id text,\n  total_cents integer NOT NULL,\n  status text NOT NULL DEFAULT 'new',\n  shipped_at timestamptz\n);"),
    ("0005_create_payments", "CREATE TABLE payments (\n  id text PRIMARY KEY,\n  captured_cents integer NOT NULL,\n  refunded_cents integer NOT NULL DEFAULT 0\n);"),
    ("0006_add_customer_marketing_flag", "ALTER TABLE customers ADD COLUMN marketing_opt_in boolean NOT NULL DEFAULT false;"),
    ("0007_create_subscriptions", "CREATE TABLE subscriptions (\n  id text PRIMARY KEY,\n  customer_id text NOT NULL,\n  plan_id text NOT NULL,\n  status text NOT NULL DEFAULT 'active',\n  cancel_at_period_end boolean NOT NULL DEFAULT false\n);"),
    ("0008_create_invoice_lines", "CREATE TABLE invoice_lines (\n  id text PRIMARY KEY,\n  invoice_id text NOT NULL,\n  description text NOT NULL,\n  unit_cents integer NOT NULL,\n  quantity integer NOT NULL DEFAULT 1\n);\nCREATE INDEX invoice_lines_invoice_idx ON invoice_lines (invoice_id);"),
    ("0009_create_webhook_deliveries", "CREATE TABLE webhook_deliveries (\n  id text PRIMARY KEY,\n  endpoint_url text NOT NULL,\n  event text NOT NULL,\n  body text NOT NULL,\n  attempt integer NOT NULL DEFAULT 1,\n  last_status integer,\n  retry_at timestamptz,\n  state text NOT NULL DEFAULT 'pending'\n);"),
    ("0010_create_api_keys", "CREATE TABLE api_keys (\n  id text PRIMARY KEY,\n  account_id text NOT NULL,\n  token_hash text NOT NULL UNIQUE,\n  expires_at timestamptz,\n  last_used_at timestamptz,\n  revoked_at timestamptz\n);"),
    ("0011_add_invoice_currency", "ALTER TABLE invoices ADD COLUMN currency char(3) NOT NULL DEFAULT 'NZD';"),
    ("0012_create_provider_events", "CREATE TABLE provider_events (\n  id text PRIMARY KEY,\n  seen_at timestamptz NOT NULL DEFAULT now()\n);"),
    ("0013_create_disputes", "CREATE TABLE disputes (\n  id text PRIMARY KEY,\n  payment_id text NOT NULL,\n  amount_cents integer NOT NULL DEFAULT 0,\n  reason text NOT NULL,\n  state text NOT NULL DEFAULT 'open'\n);"),
    ("0014_create_archived_invoices", "CREATE TABLE archived_invoices (\n  LIKE invoices_template INCLUDING ALL,\n  archived_at timestamptz NOT NULL DEFAULT now()\n);"),
    ("0015_add_orders_index", "CREATE INDEX orders_customer_idx ON orders (customer_id, status);"),
    ("0016_create_invoice_events", "CREATE TABLE invoice_events (\n  id bigserial PRIMARY KEY,\n  invoice_id text NOT NULL,\n  kind text NOT NULL,\n  at timestamptz NOT NULL DEFAULT now()\n);"),
    ("0017_add_products_active", "ALTER TABLE products ADD COLUMN active boolean NOT NULL DEFAULT true;"),
    ("0018_create_pending_credits", "CREATE TABLE pending_credits (\n  subscription_id text NOT NULL,\n  cents integer NOT NULL,\n  created_at timestamptz NOT NULL DEFAULT now()\n);"),
    ("0019_invoices_status_index", "CREATE INDEX invoices_status_due_idx ON invoices (status, due_at) WHERE status = 'open';"),
    ("0020_add_customer_locale", "ALTER TABLE customers ADD COLUMN locale text NOT NULL DEFAULT 'en-NZ';"),
    ("0021_create_subscription_periods", "CREATE TABLE subscription_periods (\n  subscription_id text NOT NULL,\n  price_cents integer NOT NULL,\n  days_used integer NOT NULL DEFAULT 0,\n  days_in_period integer NOT NULL\n);"),
    ("0022_payments_add_provider_ref", "ALTER TABLE payments ADD COLUMN provider_ref text;\nCREATE UNIQUE INDEX payments_provider_ref_idx ON payments (provider_ref);"),
    ("0023_billing_cleanup", "-- BIL-204: legacy_ref was only ever filled by the old importer.\nALTER TABLE invoices DROP COLUMN IF EXISTS legacy_ref;\nALTER TABLE invoice_lines DROP COLUMN IF EXISTS legacy_ref;"),
    ("0024_create_coupons", "CREATE TABLE coupons (\n  code text PRIMARY KEY,\n  percent_off integer NOT NULL,\n  expires_at timestamptz\n);"),
    ("0025_orders_add_notes", "ALTER TABLE orders ADD COLUMN notes text;"),
    ("0026_create_warehouses", "CREATE TABLE warehouses (\n  id text PRIMARY KEY,\n  name text NOT NULL,\n  region text NOT NULL\n);"),
    ("0027_invoice_lines_add_tax", "ALTER TABLE invoice_lines ADD COLUMN tax_cents integer;"),
    ("0028_add_invoice_region", "ALTER TABLE invoices ADD COLUMN region text NOT NULL DEFAULT 'NZ';"),
    ("0029_create_shipments", "CREATE TABLE shipments (\n  id text PRIMARY KEY,\n  order_id text NOT NULL,\n  carrier text NOT NULL,\n  tracking text\n);"),
    ("0030_api_keys_add_name", "ALTER TABLE api_keys ADD COLUMN name text NOT NULL DEFAULT 'unnamed';"),
    ("0031_add_paid_at", "ALTER TABLE invoices ADD COLUMN paid_at timestamptz;\nUPDATE invoices SET paid_at = issued_at WHERE status = 'paid';"),
    ("0032_webhook_deliveries_index", "CREATE INDEX webhook_deliveries_due_idx ON webhook_deliveries (retry_at) WHERE state = 'pending';"),
    ("0033_create_tags", "CREATE TABLE tags (\n  id text PRIMARY KEY,\n  label text NOT NULL UNIQUE\n);"),
    ("0034_subscriptions_add_trial", "ALTER TABLE subscriptions ADD COLUMN trial_ends_at timestamptz;"),
    ("0035_invoice_events_index", "CREATE INDEX invoice_events_invoice_idx ON invoice_events (invoice_id, at);"),
    ("0036_customers_country_index", "CREATE INDEX customers_country_idx ON customers (country);"),
    ("0037_disputes_add_evidence", "ALTER TABLE disputes ADD COLUMN evidence_url text;"),
    ("0038_enforce_invoice_numbers", "UPDATE invoices SET number = 'INV-' || lpad(id::text, 8, '0') WHERE number IS NULL;\nALTER TABLE invoices ALTER COLUMN number SET NOT NULL;"),
    ("0039_create_teams", "CREATE TABLE teams (\n  id text PRIMARY KEY,\n  name text NOT NULL\n);"),
    ("0040_payments_add_currency", "ALTER TABLE payments ADD COLUMN currency char(3) NOT NULL DEFAULT 'NZD';"),
]
for name, sql in MIGRATIONS:
    put(f"migrations/{name}.sql", sql + "\n")

# ---------------------------------------------------------------- generated domain modules

ENTITIES = [
    ("customer", "customers", [("name", "string"), ("email", "string"), ("country", "string"), ("marketingOptIn", "boolean"), ("createdAt", "Date")]),
    ("product", "products", [("sku", "string"), ("name", "string"), ("priceCents", "number"), ("active", "boolean")]),
    ("plan", "plans", [("code", "string"), ("name", "string"), ("monthlyCents", "number"), ("seats", "number")]),
    ("subscription", "subscriptions", [("customerId", "string"), ("planId", "string"), ("status", "string"), ("trialEndsAt", "Date | null")]),
    ("order", "orders", [("customerId", "string"), ("totalCents", "number"), ("status", "string"), ("notes", "string | null")]),
    ("shipment", "shipments", [("orderId", "string"), ("carrier", "string"), ("tracking", "string | null")]),
    ("cart", "carts", [("customerId", "string"), ("itemCount", "number"), ("expiresAt", "Date")]),
    ("coupon", "coupons", [("code", "string"), ("percentOff", "number"), ("expiresAt", "Date | null")]),
    ("warehouse", "warehouses", [("name", "string"), ("region", "string"), ("capacity", "number")]),
    ("supplier", "suppliers", [("name", "string"), ("contactEmail", "string"), ("leadDays", "number")]),
    ("ticket", "tickets", [("customerId", "string"), ("subject", "string"), ("state", "string"), ("assignee", "string | null")]),
    ("note", "notes", [("subjectId", "string"), ("author", "string"), ("body", "string")]),
    ("tag", "tags", [("label", "string"), ("color", "string")]),
    ("team", "teams", [("name", "string"), ("leadId", "string | null")]),
    ("contract", "contracts", [("customerId", "string"), ("startsOn", "Date"), ("endsOn", "Date | null"), ("valueCents", "number")]),
    ("quote", "quotes", [("customerId", "string"), ("validUntil", "Date"), ("totalCents", "number")]),
    ("catalog", "catalogs", [("name", "string"), ("region", "string"), ("published", "boolean")]),
    ("review", "reviews", [("productId", "string"), ("rating", "number"), ("body", "string")]),
    ("address", "addresses", [("customerId", "string"), ("line1", "string"), ("city", "string"), ("postcode", "string")]),
    ("notification", "notifications", [("recipientId", "string"), ("channel", "string"), ("sentAt", "Date | null")]),
    ("report", "reports", [("kind", "string"), ("requestedBy", "string"), ("state", "string")]),
    ("credit", "credits", [("customerId", "string"), ("cents", "number"), ("reason", "string")]),
    ("inventory-item", "inventory", [("sku", "string"), ("warehouseId", "string"), ("onHand", "number")]),
    ("return-request", "returns", [("orderId", "string"), ("reason", "string"), ("state", "string")]),
    ("audit-entry", "audit", [("actor", "string"), ("action", "string"), ("at", "Date")]),
]
# a few of them mention words the tasks are about, in passing, as real services do
NOISE = {
    "order": "// Orders over $5,000 need a second person to approve before they ship.",
    "return-request": "// An approved return starts a refund on the finance side; nothing here calls the payment gateway.",
    "credit": "// Credits are applied to the next invoice; they are not refunds and never touch the payment gateway.",
    "notification": "// Email sends are not retried here; the mail provider retries for 24 hours on its own.",
    "report": "// Reports are built from a read replica, so a report can lag the invoices table by a few seconds.",
    "coupon": "// Coupon percentages apply before tax.",
    "quote": "// A quote's total uses the same rounding as an invoice, but is never rounded for cash.",
    "contract": "// Contracts renew automatically unless cancelled 30 days before endsOn.",
    "audit-entry": "// Entries are append-only. Do not export from here; compliance has its own tooling.",
    "subscription": "// Prices change only at renewal.",
}

def pascal(s):
    return "".join(p.capitalize() for p in s.split("-"))

def camel(s):
    p = pascal(s)
    return p[0].lower() + p[1:]

def snake(s):
    return s.replace("-", "_")

def sample(t):
    return {"string": "'x'", "number": "1", "boolean": "true", "Date": "new Date('2026-01-01')", "Date | null": "null", "string | null": "null"}[t]

rnd = random.Random(7)
for name, plural, fields in ENTITIES:
    P, c, table = pascal(name), camel(name), snake(plural)
    d = f"src/{plural}"
    types = "\n".join(f"  {f}: {t}" for f, t in fields)
    put(f"{d}/model.ts", f"""
export type {P} = {{
  id: string
{types}
}}

export type New{P} = Omit<{P}, 'id'>
""")
    cols = ", ".join(snake(camel(f)) if False else "".join("_" + ch.lower() if ch.isupper() else ch for ch in f) for f, _ in fields)
    put(f"{d}/repo.ts", f"""
import {{ query }} from '../lib/db/pool'
import {{ withRetry }} from '../lib/db/with-retry'
import {{ newId }} from '../lib/ids'
import type {{ {P}, New{P} }} from './model'

export async function find{P}(id: string): Promise<{P} | null> {{
  const [row] = await query<{P}>(`SELECT id, {cols} FROM {table} WHERE id = $1`, [id])
  return row ?? null
}}

export async function fetch{P}s(limit = 50, offset = 0): Promise<{P}[]> {{
  return query<{P}>(`SELECT id, {cols} FROM {table} ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}}

export async function insert{P}(input: New{P}): Promise<{P}> {{
  const id = newId('{name[:3]}')
  await withRetry(() => query(`INSERT INTO {table} (id, {cols}) VALUES ($1, {", ".join(f"${i + 2}" for i in range(len(fields)))})`, [id, {", ".join(f"input.{f}" for f, _ in fields)}]))
  return {{ id, ...input }}
}}

export async function remove{P}(id: string): Promise<void> {{
  await query(`DELETE FROM {table} WHERE id = $1`, [id])
}}
""")
    first = fields[0][0]
    noise = NOISE.get(name, "")
    put(f"{d}/service.ts", f"""
import {{ notFound }} from '../lib/errors'
import {{ log }} from '../lib/log'
import {{ publish{P}Event }} from './events'
import type {{ {P}, New{P} }} from './model'
import {{ fetch{P}s, find{P}, insert{P}, remove{P} }} from './repo'
import {{ validate{P} }} from './validators'
{noise}

export async function get{P}(id: string): Promise<{P}> {{
  const found = await find{P}(id)
  if (!found) throw notFound('{name.replace("-", " ")}')
  return found
}}

export async function list{P}s(options: {{ limit?: number; offset?: number }} = {{}}): Promise<{P}[]> {{
  return fetch{P}s(options.limit, options.offset)
}}

export async function create{P}(input: New{P}): Promise<{P}> {{
  validate{P}(input)
  const created = await insert{P}(input)
  log.info('{name.replace("-", " ")} created', {{ id: created.id }})
  await publish{P}Event('created', created)
  return created
}}

export async function delete{P}(id: string): Promise<void> {{
  await get{P}(id)
  await remove{P}(id)
  await publish{P}Event('deleted', {{ id }})
}}
""")
    checks = []
    for f, t in fields:
        if t == "string": checks.append(f"  if (!input.{f}.trim()) throw badRequest('{f} is required')")
        elif t == "number": checks.append(f"  if (!Number.isFinite(input.{f}) || input.{f} < 0) throw badRequest('{f} must be zero or more')")
    put(f"{d}/validators.ts", f"""
import {{ badRequest }} from '../lib/errors'
import type {{ New{P} }} from './model'

export function validate{P}(input: New{P}): void {{
{chr(10).join(checks) if checks else "  void input"}
}}
""")
    put(f"{d}/events.ts", f"""
import {{ log }} from '../lib/log'

export type {P}EventKind = 'created' | 'updated' | 'deleted'

// In-process subscribers; the audit trail listens to all of them.
const listeners: ((kind: {P}EventKind, payload: unknown) => void)[] = []

export const on{P}Event = (fn: (kind: {P}EventKind, payload: unknown) => void) => listeners.push(fn)

export async function publish{P}Event(kind: {P}EventKind, payload: unknown): Promise<void> {{
  log.debug('{name.replace("-", " ")} event', {{ kind }})
  for (const fn of listeners) fn(kind, payload)
}}
""")
    put(f"src/http/routes/{plural}.ts", f"""
import {{ Router }} from 'express'
import {{ create{P}, delete{P}, get{P}, list{P}s }} from '../../{plural}/service'

export const {camel(plural)}Routes = Router()

{camel(plural)}Routes.get('/{plural}', async (req, res) => res.json(await list{P}s({{ limit: Number(req.query.limit ?? 50) }})))
{camel(plural)}Routes.get('/{plural}/:id', async (req, res) => res.json(await get{P}(req.params.id!)))
{camel(plural)}Routes.post('/{plural}', async (req, res) => res.status(201).json(await create{P}(req.body)))
{camel(plural)}Routes.delete('/{plural}/:id', async (req, res) => {{ await delete{P}(req.params.id!); res.status(204).end() }})
""")
    sample_obj = ", ".join(f"{f}: {sample(t)}" for f, t in fields)
    bad = next((f for f, t in fields if t == "string"), None)
    put(f"tests/{plural}/service.spec.ts", f"""
import {{ expect, test, vi }} from 'vitest'
import {{ create{P}, get{P} }} from '../../src/{plural}/service'

vi.mock('../../src/{plural}/repo', () => ({{
  insert{P}: vi.fn(async (input: object) => ({{ id: '{name[:3]}_1', ...input }})),
  find{P}: vi.fn(async (id: string) => (id === '{name[:3]}_1' ? {{ id, {sample_obj} }} : null)),
  fetch{P}s: vi.fn(async () => []),
  remove{P}: vi.fn(),
}}))

test('creates a {name.replace("-", " ")} and returns it with an id', async () => {{
  const created = await create{P}({{ {sample_obj} }})
  expect(created.id).toBe('{name[:3]}_1')
}})

test('a missing {name.replace("-", " ")} is a 404', async () => {{
  await expect(get{P}('nope')).rejects.toMatchObject({{ status: 404 }})
}})
""")
    if bad:
        put(f"tests/{plural}/validators.spec.ts", f"""
import {{ expect, test }} from 'vitest'
import {{ validate{P} }} from '../../src/{plural}/validators'

test('{bad} is required', () => {{
  expect(() => validate{P}({{ {sample_obj.replace(f"{bad}: 'x'", f"{bad}: ' '")} }})).toThrow('{bad} is required')
}})
""")

# ---------------------------------------------------------------- write it all out

if os.path.isdir(OUT):
    shutil.rmtree(OUT)
for path, text in sorted(files.items()):
    full = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as fh:
        fh.write(text if text.endswith("\n") else text + "\n")
print(f"wrote {len(files)} files to {OUT}")
