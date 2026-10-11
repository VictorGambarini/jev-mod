import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishContractEvent } from './events'
import type { Contract, NewContract } from './model'
import { fetchContracts, findContract, insertContract, removeContract } from './repo'
import { validateContract } from './validators'
// Contracts renew automatically unless cancelled 30 days before endsOn.

export async function getContract(id: string): Promise<Contract> {
  const found = await findContract(id)
  if (!found) throw notFound('contract')
  return found
}

export async function listContracts(options: { limit?: number; offset?: number } = {}): Promise<Contract[]> {
  return fetchContracts(options.limit, options.offset)
}

export async function createContract(input: NewContract): Promise<Contract> {
  validateContract(input)
  const created = await insertContract(input)
  log.info('contract created', { id: created.id })
  await publishContractEvent('created', created)
  return created
}

export async function deleteContract(id: string): Promise<void> {
  await getContract(id)
  await removeContract(id)
  await publishContractEvent('deleted', { id })
}
