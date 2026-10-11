import { Router } from 'express'
import { createTag, deleteTag, getTag, listTags } from '../../tags/service'

export const tagsRoutes = Router()

tagsRoutes.get('/tags', async (req, res) => res.json(await listTags({ limit: Number(req.query.limit ?? 50) })))
tagsRoutes.get('/tags/:id', async (req, res) => res.json(await getTag(req.params.id!)))
tagsRoutes.post('/tags', async (req, res) => res.status(201).json(await createTag(req.body)))
tagsRoutes.delete('/tags/:id', async (req, res) => { await deleteTag(req.params.id!); res.status(204).end() })
