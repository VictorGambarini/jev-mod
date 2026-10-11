import { Router } from 'express'
import { createCredit, deleteCredit, getCredit, listCredits } from '../../credits/service'

export const creditsRoutes = Router()

creditsRoutes.get('/credits', async (req, res) => res.json(await listCredits({ limit: Number(req.query.limit ?? 50) })))
creditsRoutes.get('/credits/:id', async (req, res) => res.json(await getCredit(req.params.id!)))
creditsRoutes.post('/credits', async (req, res) => res.status(201).json(await createCredit(req.body)))
creditsRoutes.delete('/credits/:id', async (req, res) => { await deleteCredit(req.params.id!); res.status(204).end() })
