import { Pool } from 'pg'

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })

export const query = <T = unknown>(text: string, params: unknown[] = []) => pool.query(text, params).then(r => r.rows as T[])
