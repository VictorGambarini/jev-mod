export type Region = { code: string; currency: string; taxName: string }

export const REGIONS: Region[] = [
  { code: 'NZ', currency: 'NZD', taxName: 'GST' },
  { code: 'AU', currency: 'AUD', taxName: 'GST' },
  { code: 'GB', currency: 'GBP', taxName: 'VAT' },
  { code: 'DE', currency: 'EUR', taxName: 'MwSt' },
  { code: 'US', currency: 'USD', taxName: 'Sales tax' },
]

export const regionOf = (code: string) => REGIONS.find(r => r.code === code.toUpperCase())
