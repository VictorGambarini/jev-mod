import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishCreditEvent } from './events'
import type { Credit, NewCredit } from './model'
import { fetchCredits, findCredit, insertCredit, removeCredit } from './repo'
import { validateCredit } from './validators'
// Credits are applied to the next invoice; they are not refunds and never touch the payment gateway.

export async function getCredit(id: string): Promise<Credit> {
  const found = await findCredit(id)
  if (!found) throw notFound('credit')
  return found
}

export async function listCredits(options: { limit?: number; offset?: number } = {}): Promise<Credit[]> {
  return fetchCredits(options.limit, options.offset)
}

export async function createCredit(input: NewCredit): Promise<Credit> {
  validateCredit(input)
  const created = await insertCredit(input)
  log.info('credit created', { id: created.id })
  await publishCreditEvent('created', created)
  return created
}

export async function deleteCredit(id: string): Promise<void> {
  await getCredit(id)
  await removeCredit(id)
  await publishCreditEvent('deleted', { id })
}
