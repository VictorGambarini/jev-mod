import { expect, test } from 'vitest'
import { validateNote } from '../../src/notes/validators'

test('subjectId is required', () => {
  expect(() => validateNote({ subjectId: ' ', author: 'x', body: 'x' })).toThrow('subjectId is required')
})
