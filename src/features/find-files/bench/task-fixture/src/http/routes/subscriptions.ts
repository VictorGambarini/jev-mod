import { Router } from 'express'
import { createSubscription, deleteSubscription, getSubscription, listSubscriptions } from '../../subscriptions/service'

export const subscriptionsRoutes = Router()

subscriptionsRoutes.get('/subscriptions', async (req, res) => res.json(await listSubscriptions({ limit: Number(req.query.limit ?? 50) })))
subscriptionsRoutes.get('/subscriptions/:id', async (req, res) => res.json(await getSubscription(req.params.id!)))
subscriptionsRoutes.post('/subscriptions', async (req, res) => res.status(201).json(await createSubscription(req.body)))
subscriptionsRoutes.delete('/subscriptions/:id', async (req, res) => { await deleteSubscription(req.params.id!); res.status(204).end() })
