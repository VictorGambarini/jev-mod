export type InventoryItem = {
  id: string
  sku: string
  warehouseId: string
  onHand: number
}

export type NewInventoryItem = Omit<InventoryItem, 'id'>
