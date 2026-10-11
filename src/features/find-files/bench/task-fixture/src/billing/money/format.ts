export function formatMoney(cents: number, currency: string, locale = 'en-NZ'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
}
