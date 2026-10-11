import { Router } from 'express'
import { createNote, deleteNote, getNote, listNotes } from '../../notes/service'

export const notesRoutes = Router()

notesRoutes.get('/notes', async (req, res) => res.json(await listNotes({ limit: Number(req.query.limit ?? 50) })))
notesRoutes.get('/notes/:id', async (req, res) => res.json(await getNote(req.params.id!)))
notesRoutes.post('/notes', async (req, res) => res.status(201).json(await createNote(req.body)))
notesRoutes.delete('/notes/:id', async (req, res) => { await deleteNote(req.params.id!); res.status(204).end() })
