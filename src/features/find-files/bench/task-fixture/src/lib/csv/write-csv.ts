// Writes rows as RFC 4180 CSV. Shared by every export in the app.
export function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function writeCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n') + '\r\n'
}
