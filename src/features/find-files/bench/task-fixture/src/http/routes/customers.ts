import { Router } from 'express'
import { createCustomer, deleteCustomer, getCustomer, listCustomers } from '../../customers/service'

export const customersRoutes = Router()

customersRoutes.get('/customers', async (req, res) => res.json(await listCustomers({ limit: Number(req.query.limit ?? 50) })))
customersRoutes.get('/customers/:id', async (req, res) => res.json(await getCustomer(req.params.id!)))
customersRoutes.post('/customers', async (req, res) => res.status(201).json(await createCustomer(req.body)))
customersRoutes.delete('/customers/:id', async (req, res) => { await deleteCustomer(req.params.id!); res.status(204).end() })
