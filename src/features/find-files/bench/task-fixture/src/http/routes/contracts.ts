import { Router } from 'express'
import { createContract, deleteContract, getContract, listContracts } from '../../contracts/service'

export const contractsRoutes = Router()

contractsRoutes.get('/contracts', async (req, res) => res.json(await listContracts({ limit: Number(req.query.limit ?? 50) })))
contractsRoutes.get('/contracts/:id', async (req, res) => res.json(await getContract(req.params.id!)))
contractsRoutes.post('/contracts', async (req, res) => res.status(201).json(await createContract(req.body)))
contractsRoutes.delete('/contracts/:id', async (req, res) => { await deleteContract(req.params.id!); res.status(204).end() })
