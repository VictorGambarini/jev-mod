import type { NextFunction, Request, Response } from 'express'
import { findKey } from '../../auth/apikeys/store'
import { AppError } from '../../lib/errors'

// Authenticates machine clients: `Authorization: Bearer tbk_...`. An expired key is a 401 with code api_key_expired,
// so integrations can tell it apart from a wrong key and rotate it.
export async function apiKeyAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.header('authorization')?.replace(/^Bearer /, '')
  if (!token?.startsWith('tbk_')) throw new AppError(401, 'unauthorized', 'an API key is required')
  const key = await findKey(token)
  if (!key) throw new AppError(401, 'unauthorized', 'unknown API key')
  if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) throw new AppError(401, 'api_key_expired', 'this API key has expired')
  Object.assign(req, { accountId: key.accountId })
  next()
}
