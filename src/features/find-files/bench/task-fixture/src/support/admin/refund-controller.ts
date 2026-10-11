import type { Request, Response } from 'express'
import { refundPayment } from '../../payments/refunds'
import { badRequest } from '../../lib/errors'

// POST /admin/payments/:id/refund, for support staff.
export async function refundController(req: Request, res: Response) {
  const amount = Number(req.body.amountCents)
  if (!Number.isInteger(amount) || amount <= 0) throw badRequest('amountCents must be a positive whole number')
  const refund = await refundPayment(req.params.id!, amount, String(req.body.reason ?? 'support refund'))
  res.status(201).json(refund)
}
