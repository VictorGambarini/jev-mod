import { notFound } from '../lib/errors'
import { log } from '../lib/log'
import { publishTagEvent } from './events'
import type { Tag, NewTag } from './model'
import { fetchTags, findTag, insertTag, removeTag } from './repo'
import { validateTag } from './validators'


export async function getTag(id: string): Promise<Tag> {
  const found = await findTag(id)
  if (!found) throw notFound('tag')
  return found
}

export async function listTags(options: { limit?: number; offset?: number } = {}): Promise<Tag[]> {
  return fetchTags(options.limit, options.offset)
}

export async function createTag(input: NewTag): Promise<Tag> {
  validateTag(input)
  const created = await insertTag(input)
  log.info('tag created', { id: created.id })
  await publishTagEvent('created', created)
  return created
}

export async function deleteTag(id: string): Promise<void> {
  await getTag(id)
  await removeTag(id)
  await publishTagEvent('deleted', { id })
}
