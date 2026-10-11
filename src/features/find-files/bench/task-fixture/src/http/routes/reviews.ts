import { Router } from 'express'
import { createReview, deleteReview, getReview, listReviews } from '../../reviews/service'

export const reviewsRoutes = Router()

reviewsRoutes.get('/reviews', async (req, res) => res.json(await listReviews({ limit: Number(req.query.limit ?? 50) })))
reviewsRoutes.get('/reviews/:id', async (req, res) => res.json(await getReview(req.params.id!)))
reviewsRoutes.post('/reviews', async (req, res) => res.status(201).json(await createReview(req.body)))
reviewsRoutes.delete('/reviews/:id', async (req, res) => { await deleteReview(req.params.id!); res.status(204).end() })
