import { Router } from 'express'
import { createReport, deleteReport, getReport, listReports } from '../../reports/service'

export const reportsRoutes = Router()

reportsRoutes.get('/reports', async (req, res) => res.json(await listReports({ limit: Number(req.query.limit ?? 50) })))
reportsRoutes.get('/reports/:id', async (req, res) => res.json(await getReport(req.params.id!)))
reportsRoutes.post('/reports', async (req, res) => res.status(201).json(await createReport(req.body)))
reportsRoutes.delete('/reports/:id', async (req, res) => { await deleteReport(req.params.id!); res.status(204).end() })
