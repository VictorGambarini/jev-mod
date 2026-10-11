export type Tag = {
  id: string
  label: string
  color: string
}

export type NewTag = Omit<Tag, 'id'>
