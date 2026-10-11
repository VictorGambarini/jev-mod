import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishQuoteEvent } from './events'
import type { Quote, NewQuote } from './model'
import { fetchQuotes, findQuote, insertQuote, removeQuote } from './repo'
import { validateQuote } from './validators'
// A quote's total uses the same rounding as an invoice, but is never rounded for cash.

export async function getQuote(id: string): Promise<Quote> {
  const found = await findQuote(id)
  if (!found) throw notFound('quote')
  return found
}

export async function listQuotes(options: { limit?: number; offset?: number } = {}): Promise<Quote[]> {
  return fetchQuotes(options.limit, options.offset)
}

export async function createQuote(input: NewQuote): Promise<Quote> {
  validateQuote(input)
  const created = await insertQuote(input)
  log.info('quote created', { id: created.id })
  await publishQuoteEvent('created', created)
  return created
}

export async function deleteQuote(id: string): Promise<void> {
  await getQuote(id)
  await removeQuote(id)
  await publishQuoteEvent('deleted', { id })
}
