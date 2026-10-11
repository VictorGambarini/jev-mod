import { Router } from 'express'
import { createNotification, deleteNotification, getNotification, listNotifications } from '../../notifications/service'

export const notificationsRoutes = Router()

notificationsRoutes.get('/notifications', async (req, res) => res.json(await listNotifications({ limit: Number(req.query.limit ?? 50) })))
notificationsRoutes.get('/notifications/:id', async (req, res) => res.json(await getNotification(req.params.id!)))
notificationsRoutes.post('/notifications', async (req, res) => res.status(201).json(await createNotification(req.body)))
notificationsRoutes.delete('/notifications/:id', async (req, res) => { await deleteNotification(req.params.id!); res.status(204).end() })
