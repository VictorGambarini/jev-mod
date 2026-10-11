import { Router } from 'express'
import { createAddress, deleteAddress, getAddress, listAddresss } from '../../addresses/service'

export const addressesRoutes = Router()

addressesRoutes.get('/addresses', async (req, res) => res.json(await listAddresss({ limit: Number(req.query.limit ?? 50) })))
addressesRoutes.get('/addresses/:id', async (req, res) => res.json(await getAddress(req.params.id!)))
addressesRoutes.post('/addresses', async (req, res) => res.status(201).json(await createAddress(req.body)))
addressesRoutes.delete('/addresses/:id', async (req, res) => { await deleteAddress(req.params.id!); res.status(204).end() })
