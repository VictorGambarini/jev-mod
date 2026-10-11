import { Router } from 'express'
import { createOrder, deleteOrder, getOrder, listOrders } from '../../orders/service'

export const ordersRoutes = Router()

ordersRoutes.get('/orders', async (req, res) => res.json(await listOrders({ limit: Number(req.query.limit ?? 50) })))
ordersRoutes.get('/orders/:id', async (req, res) => res.json(await getOrder(req.params.id!)))
ordersRoutes.post('/orders', async (req, res) => res.status(201).json(await createOrder(req.body)))
ordersRoutes.delete('/orders/:id', async (req, res) => { await deleteOrder(req.params.id!); res.status(204).end() })
