import { expect, test } from 'vitest'
import { validateReview } from '../../src/reviews/validators'

test('productId is required', () => {
  expect(() => validateReview({ productId: ' ', rating: 1, body: 'x' })).toThrow('productId is required')
})
