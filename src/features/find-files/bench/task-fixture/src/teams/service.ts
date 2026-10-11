import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishTeamEvent } from './events'
import type { Team, NewTeam } from './model'
import { fetchTeams, findTeam, insertTeam, removeTeam } from './repo'
import { validateTeam } from './validators'


export async function getTeam(id: string): Promise<Team> {
  const found = await findTeam(id)
  if (!found) throw notFound('team')
  return found
}

export async function listTeams(options: { limit?: number; offset?: number } = {}): Promise<Team[]> {
  return fetchTeams(options.limit, options.offset)
}

export async function createTeam(input: NewTeam): Promise<Team> {
  validateTeam(input)
  const created = await insertTeam(input)
  log.info('team created', { id: created.id })
  await publishTeamEvent('created', created)
  return created
}

export async function deleteTeam(id: string): Promise<void> {
  await getTeam(id)
  await removeTeam(id)
  await publishTeamEvent('deleted', { id })
}
