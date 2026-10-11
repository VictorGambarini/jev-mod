import { readdir, readFile } from 'node:fs/promises'
import { pool } from '../src/lib/db/pool'

const dir = new URL('../migrations/', import.meta.url).pathname
await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())')
const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map(r => r.name))
for (const name of (await readdir(dir)).sort()) {
  if (done.has(name)) continue
  await pool.query(await readFile(dir + name, 'utf8'))
  await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name])
  console.log('applied', name)
}
await pool.end()
