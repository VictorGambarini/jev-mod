import { Router } from 'express'
import { createInventoryItem, deleteInventoryItem, getInventoryItem, listInventoryItems } from '../../inventory/service'

export const inventoryRoutes = Router()

inventoryRoutes.get('/inventory', async (req, res) => res.json(await listInventoryItems({ limit: Number(req.query.limit ?? 50) })))
inventoryRoutes.get('/inventory/:id', async (req, res) => res.json(await getInventoryItem(req.params.id!)))
inventoryRoutes.post('/inventory', async (req, res) => res.status(201).json(await createInventoryItem(req.body)))
inventoryRoutes.delete('/inventory/:id', async (req, res) => { await deleteInventoryItem(req.params.id!); res.status(204).end() })
