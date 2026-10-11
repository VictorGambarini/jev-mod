import { Router } from 'express'
import { createPlan, deletePlan, getPlan, listPlans } from '../../plans/service'

export const plansRoutes = Router()

plansRoutes.get('/plans', async (req, res) => res.json(await listPlans({ limit: Number(req.query.limit ?? 50) })))
plansRoutes.get('/plans/:id', async (req, res) => res.json(await getPlan(req.params.id!)))
plansRoutes.post('/plans', async (req, res) => res.status(201).json(await createPlan(req.body)))
plansRoutes.delete('/plans/:id', async (req, res) => { await deletePlan(req.params.id!); res.status(204).end() })
