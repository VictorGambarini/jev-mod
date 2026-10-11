export type Reminder = { name: string; subject: string }

export function reminderFor(daysLate: number): Reminder {
  if (daysLate < 7) return { name: 'friendly', subject: 'A reminder about your invoice' }
  if (daysLate < 30) return { name: 'firm', subject: 'Your invoice is overdue' }
  return { name: 'final', subject: 'Final notice: overdue invoice' }
}
