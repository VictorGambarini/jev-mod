import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Team, NewTeam } from './model'

export async function findTeam(id: string): Promise<Team | null> {
  const [row] = await query<Team>(`SELECT id, name, lead_id FROM teams WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchTeams(limit = 50, offset = 0): Promise<Team[]> {
  return query<Team>(`SELECT id, name, lead_id FROM teams ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertTeam(input: NewTeam): Promise<Team> {
  const id = newId('tea')
  await withRetry(() => query(`INSERT INTO teams (id, name, lead_id) VALUES ($1, $2, $3)`, [id, input.name, input.leadId]))
  return { id, ...input }
}

export async function removeTeam(id: string): Promise<void> {
  await query(`DELETE FROM teams WHERE id = $1`, [id])
}
