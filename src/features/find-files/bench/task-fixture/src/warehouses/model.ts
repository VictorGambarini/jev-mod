export type Warehouse = {
  id: string
  name: string
  region: string
  capacity: number
}

export type NewWarehouse = Omit<Warehouse, 'id'>
