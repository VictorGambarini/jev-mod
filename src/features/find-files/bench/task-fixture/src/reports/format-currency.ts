// Display helper for report tables: rounds to whole dollars for the executive summary.
export const wholeDollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-NZ')}`
