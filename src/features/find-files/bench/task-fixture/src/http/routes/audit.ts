import { Router } from 'express'
import { createAuditEntry, deleteAuditEntry, getAuditEntry, listAuditEntrys } from '../../audit/service'

export const auditRoutes = Router()

auditRoutes.get('/audit', async (req, res) => res.json(await listAuditEntrys({ limit: Number(req.query.limit ?? 50) })))
auditRoutes.get('/audit/:id', async (req, res) => res.json(await getAuditEntry(req.params.id!)))
auditRoutes.post('/audit', async (req, res) => res.status(201).json(await createAuditEntry(req.body)))
auditRoutes.delete('/audit/:id', async (req, res) => { await deleteAuditEntry(req.params.id!); res.status(204).end() })
