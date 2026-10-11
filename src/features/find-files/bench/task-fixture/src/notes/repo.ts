import { query } from '../lib/db/pool'
import { withRetry } from '../lib/db/with-retry'
import { newId } from '../lib/ids'
import type { Note, NewNote } from './model'

export async function findNote(id: string): Promise<Note | null> {
  const [row] = await query<Note>(`SELECT id, subject_id, author, body FROM notes WHERE id = $1`, [id])
  return row ?? null
}

export async function fetchNotes(limit = 50, offset = 0): Promise<Note[]> {
  return query<Note>(`SELECT id, subject_id, author, body FROM notes ORDER BY id LIMIT $1 OFFSET $2`, [limit, offset])
}

export async function insertNote(input: NewNote): Promise<Note> {
  const id = newId('not')
  await withRetry(() => query(`INSERT INTO notes (id, subject_id, author, body) VALUES ($1, $2, $3, $4)`, [id, input.subjectId, input.author, input.body]))
  return { id, ...input }
}

export async function removeNote(id: string): Promise<void> {
  await query(`DELETE FROM notes WHERE id = $1`, [id])
}
