import { Router } from 'express'
import { createProduct, deleteProduct, getProduct, listProducts } from '../../products/service'

export const productsRoutes = Router()

productsRoutes.get('/products', async (req, res) => res.json(await listProducts({ limit: Number(req.query.limit ?? 50) })))
productsRoutes.get('/products/:id', async (req, res) => res.json(await getProduct(req.params.id!)))
productsRoutes.post('/products', async (req, res) => res.status(201).json(await createProduct(req.body)))
productsRoutes.delete('/products/:id', async (req, res) => { await deleteProduct(req.params.id!); res.status(204).end() })
