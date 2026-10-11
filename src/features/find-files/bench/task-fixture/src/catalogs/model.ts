export type Catalog = {
  id: string
  name: string
  region: string
  published: boolean
}

export type NewCatalog = Omit<Catalog, 'id'>
