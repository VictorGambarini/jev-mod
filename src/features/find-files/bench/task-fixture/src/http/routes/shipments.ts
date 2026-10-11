import { Router } from 'express'
import { createShipment, deleteShipment, getShipment, listShipments } from '../../shipments/service'

export const shipmentsRoutes = Router()

shipmentsRoutes.get('/shipments', async (req, res) => res.json(await listShipments({ limit: Number(req.query.limit ?? 50) })))
shipmentsRoutes.get('/shipments/:id', async (req, res) => res.json(await getShipment(req.params.id!)))
shipmentsRoutes.post('/shipments', async (req, res) => res.status(201).json(await createShipment(req.body)))
shipmentsRoutes.delete('/shipments/:id', async (req, res) => { await deleteShipment(req.params.id!); res.status(204).end() })
