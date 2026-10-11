import { Router } from 'express'
import { createCart, deleteCart, getCart, listCarts } from '../../carts/service'

export const cartsRoutes = Router()

cartsRoutes.get('/carts', async (req, res) => res.json(await listCarts({ limit: Number(req.query.limit ?? 50) })))
cartsRoutes.get('/carts/:id', async (req, res) => res.json(await getCart(req.params.id!)))
cartsRoutes.post('/carts', async (req, res) => res.status(201).json(await createCart(req.body)))
cartsRoutes.delete('/carts/:id', async (req, res) => { await deleteCart(req.params.id!); res.status(204).end() })
