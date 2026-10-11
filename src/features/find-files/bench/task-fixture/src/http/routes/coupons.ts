import { Router } from 'express'
import { createCoupon, deleteCoupon, getCoupon, listCoupons } from '../../coupons/service'

export const couponsRoutes = Router()

couponsRoutes.get('/coupons', async (req, res) => res.json(await listCoupons({ limit: Number(req.query.limit ?? 50) })))
couponsRoutes.get('/coupons/:id', async (req, res) => res.json(await getCoupon(req.params.id!)))
couponsRoutes.post('/coupons', async (req, res) => res.status(201).json(await createCoupon(req.body)))
couponsRoutes.delete('/coupons/:id', async (req, res) => { await deleteCoupon(req.params.id!); res.status(204).end() })
