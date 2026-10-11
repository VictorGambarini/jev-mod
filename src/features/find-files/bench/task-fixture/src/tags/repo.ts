import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Tag, NewTag } from './model'

export async function findTag(id: string): Promise<Tag | null> {
  const [row] = await query<Tag>(`SELECT id, label, color FROM tags WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchTags(limit = 50, offset = 0): Promise<Tag[]> {
  return query<Tag>(`SELECT id, label, color FROM tags ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertTag(input: NewTag): Promise<Tag> {
  const id = newId('tag')
  await withRetry(() => query(`INSERT INTO tags (id, label, color) VALUES ($1, $2, $3)`, [id, input.label, input.color]))
  return { id, ...input }
}

export async function removeTag(id: string): Promise<void> {
  await query(`DELETE FROM tags WHERE id = $1`, [id])
}
