import { Router } from 'express'
import { createReturnRequest, deleteReturnRequest, getReturnRequest, listReturnRequests } from '../../returns/service'

export const returnsRoutes = Router()

returnsRoutes.get('/returns', async (req, res) => res.json(await listReturnRequests({ limit: Number(req.query.limit ?? 50) })))
returnsRoutes.get('/returns/:id', async (req, res) => res.json(await getReturnRequest(req.params.id!)))
returnsRoutes.post('/returns', async (req, res) => res.status(201).json(await createReturnRequest(req.body)))
returnsRoutes.delete('/returns/:id', async (req, res) => { await deleteReturnRequest(req.params.id!); res.status(204).end() })
