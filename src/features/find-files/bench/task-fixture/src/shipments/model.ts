export type Shipment = {
  id: string
  orderId: string
  carrier: string
  tracking: string | null
}

export type NewShipment = Omit<Shipment, 'id'>
