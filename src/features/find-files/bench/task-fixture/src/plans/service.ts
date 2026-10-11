import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishPlanEvent } from './events'
import type { Plan, NewPlan } from './model'
import { fetchPlans, findPlan, insertPlan, removePlan } from './repo'
import { validatePlan } from './validators'


export async function getPlan(id: string): Promise<Plan> {
  const found = await findPlan(id)
  if (!found) throw notFound('plan')
  return found
}

export async function listPlans(options: { limit?: number; offset?: number } = {}): Promise<Plan[]> {
  return fetchPlans(options.limit, options.offset)
}

export async function createPlan(input: NewPlan): Promise<Plan> {
  validatePlan(input)
  const created = await insertPlan(input)
  log.info('plan created', { id: created.id })
  await publishPlanEvent('created', created)
  return created
}

export async function deletePlan(id: string): Promise<void> {
  await getPlan(id)
  await removePlan(id)
  await publishPlanEvent('deleted', { id })
}
