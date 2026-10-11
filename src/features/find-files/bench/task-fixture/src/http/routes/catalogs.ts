import { Router } from 'express'
import { createCatalog, deleteCatalog, getCatalog, listCatalogs } from '../../catalogs/service'

export const catalogsRoutes = Router()

catalogsRoutes.get('/catalogs', async (req, res) => res.json(await listCatalogs({ limit: Number(req.query.limit ?? 50) })))
catalogsRoutes.get('/catalogs/:id', async (req, res) => res.json(await getCatalog(req.params.id!)))
catalogsRoutes.post('/catalogs', async (req, res) => res.status(201).json(await createCatalog(req.body)))
catalogsRoutes.delete('/catalogs/:id', async (req, res) => { await deleteCatalog(req.params.id!); res.status(204).end() })
