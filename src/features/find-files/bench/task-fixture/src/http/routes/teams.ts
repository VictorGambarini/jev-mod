import { Router } from 'express'
import { createTeam, deleteTeam, getTeam, listTeams } from '../../teams/service'

export const teamsRoutes = Router()

teamsRoutes.get('/teams', async (req, res) => res.json(await listTeams({ limit: Number(req.query.limit ?? 50) })))
teamsRoutes.get('/teams/:id', async (req, res) => res.json(await getTeam(req.params.id!)))
teamsRoutes.post('/teams', async (req, res) => res.status(201).json(await createTeam(req.body)))
teamsRoutes.delete('/teams/:id', async (req, res) => { await deleteTeam(req.params.id!); res.status(204).end() })
