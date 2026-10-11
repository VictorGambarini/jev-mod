export type Note = {
  id: string
  subjectId: string
  author: string
  body: string
}

export type NewNote = Omit<Note, 'id'>
