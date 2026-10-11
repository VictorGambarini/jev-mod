import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Plan, NewPlan } from './model'

export async function findPlan(id: string): Promise<Plan | null> {
  const [row] = await query<Plan>(`SELECT id, code, name, monthly_cents, seats FROM plans WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchPlans(limit = 50, offset = 0): Promise<Plan[]> {
  return query<Plan>(`SELECT id, code, name, monthly_cents, seats FROM plans ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertPlan(input: NewPlan): Promise<Plan> {
  const id = newId('pla')
  await withRetry(() => query(`INSERT INTO plans (id, code, name, monthly_cents, seats) VALUES ($1, $2, $3, $4, $5)`, [id, input.code, input.name, input.monthlyCents, input.seats]))
  return { id, ...input }
}

export async function removePlan(id: string): Promise<void> {
  await query(`DELETE FROM plans WHERE id = $1`, [id])
}
