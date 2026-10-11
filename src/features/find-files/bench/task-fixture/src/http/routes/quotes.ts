import { Router } from 'express'
import { createQuote, deleteQuote, getQuote, listQuotes } from '../../quotes/service'

export const quotesRoutes = Router()

quotesRoutes.get('/quotes', async (req, res) => res.json(await listQuotes({ limit: Number(req.query.limit ?? 50) })))
quotesRoutes.get('/quotes/:id', async (req, res) => res.json(await getQuote(req.params.id!)))
quotesRoutes.post('/quotes', async (req, res) => res.status(201).json(await createQuote(req.body)))
quotesRoutes.delete('/quotes/:id', async (req, res) => { await deleteQuote(req.params.id!); res.status(204).end() })
