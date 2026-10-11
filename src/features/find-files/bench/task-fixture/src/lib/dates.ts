export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000)
export const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
export const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000)
export const isoDate = (d: Date) => d.toISOString().slice(0, 10)
