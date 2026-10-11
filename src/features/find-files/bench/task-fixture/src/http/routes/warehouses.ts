import { Router } from 'express'
import { createWarehouse, deleteWarehouse, getWarehouse, listWarehouses } from '../../warehouses/service'

export const warehousesRoutes = Router()

warehousesRoutes.get('/warehouses', async (req, res) => res.json(await listWarehouses({ limit: Number(req.query.limit ?? 50) })))
warehousesRoutes.get('/warehouses/:id', async (req, res) => res.json(await getWarehouse(req.params.id!)))
warehousesRoutes.post('/warehouses', async (req, res) => res.status(201).json(await createWarehouse(req.body)))
warehousesRoutes.delete('/warehouses/:id', async (req, res) => { await deleteWarehouse(req.params.id!); res.status(204).end() })
