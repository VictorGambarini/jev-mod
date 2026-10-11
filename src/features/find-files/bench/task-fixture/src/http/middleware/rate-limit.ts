import type { NextFunction, Request, Response } from 'express'

const hits = new Map<string, { count: number; resetAt: number }>()

// 600 requests a minute per account.
export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const who = String((req as unknown as { accountId?: string }).accountId ?? req.ip)
  const now = Date.now()
  const h = hits.get(who) && hits.get(who)!.resetAt > now ? hits.get(who)! : { count: 0, resetAt: now + 60_000 }
  h.count++
  hits.set(who, h)
  if (h.count > 600) return res.status(429).json({ code: 'rate_limited' })
  next()
}
