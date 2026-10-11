import type { NextFunction, Request, Response } from 'express'
import { readSession } from '../../auth/session'
import { AppError } from '../../lib/errors'

// Authenticates people using the dashboard, from the session cookie. Sessions expire after 12 hours idle.
export async function sessionAuth(req: Request, _res: Response, next: NextFunction) {
  const session = await readSession(req.headers.cookie)
  if (!session) throw new AppError(401, 'unauthorized', 'sign in first')
  if (session.idleSeconds > 12 * 3600) throw new AppError(401, 'session_expired', 'your session expired')
  Object.assign(req, { accountId: session.accountId })
  next()
}
