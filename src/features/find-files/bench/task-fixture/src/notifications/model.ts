export type Notification = {
  id: string
  recipientId: string
  channel: string
  sentAt: Date | null
}

export type NewNotification = Omit<Notification, 'id'>
