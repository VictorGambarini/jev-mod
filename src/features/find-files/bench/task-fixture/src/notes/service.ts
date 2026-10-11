import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishNoteEvent } from './events'
import type { Note, NewNote } from './model'
import { fetchNotes, findNote, insertNote, removeNote } from './repo'
import { validateNote } from './validators'


export async function getNote(id: string): Promise<Note> {
  const found = await findNote(id)
  if (!found) throw notFound('note')
  return found
}

export async function listNotes(options: { limit?: number; offset?: number } = {}): Promise<Note[]> {
  return fetchNotes(options.limit, options.offset)
}

export async function createNote(input: NewNote): Promise<Note> {
  validateNote(input)
  const created = await insertNote(input)
  log.info('note created', { id: created.id })
  await publishNoteEvent('created', created)
  return created
}

export async function deleteNote(id: string): Promise<void> {
  await getNote(id)
  await removeNote(id)
  await publishNoteEvent('deleted', { id })
}
