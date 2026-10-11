import { Router } from 'express'
import { createSupplier, deleteSupplier, getSupplier, listSuppliers } from '../../suppliers/service'

export const suppliersRoutes = Router()

suppliersRoutes.get('/suppliers', async (req, res) => res.json(await listSuppliers({ limit: Number(req.query.limit ?? 50) })))
suppliersRoutes.get('/suppliers/:id', async (req, res) => res.json(await getSupplier(req.params.id!)))
suppliersRoutes.post('/suppliers', async (req, res) => res.status(201).json(await createSupplier(req.body)))
suppliersRoutes.delete('/suppliers/:id', async (req, res) => { await deleteSupplier(req.params.id!); res.status(204).end() })
