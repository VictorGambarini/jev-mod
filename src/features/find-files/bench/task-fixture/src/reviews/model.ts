export type Review = {
  id: string
  productId: string
  rating: number
  body: string
}

export type NewReview = Omit<Review, 'id'>
