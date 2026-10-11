export type Product = {
  id: string
  sku: string
  name: string
  priceCents: number
  active: boolean
}

export type NewProduct = Omit<Product, 'id'>
