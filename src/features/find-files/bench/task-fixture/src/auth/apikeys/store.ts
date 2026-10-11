import { query } from '../../lib/db/pool'

export type ApiKey = { accountId: string; expiresAt: Date | null }

export async function findKey(token: string): Promise<ApiKey | null> {
  const [row] = await query<{ account_id: string; expires_at: Date | null }>(
    `SELECT account_id, expires_at FROM api_keys WHERE token_hash = encode(sha256($1::bytea), 'hex') AND revoked_at IS NULL`, [token])
  return row ? { accountId: row.account_id, expiresAt: row.expires_at } : null
}
