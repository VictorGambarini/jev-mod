// Rounds a number of cents to a whole cent, halves to the even neighbour (banker's rounding).
export function roundHalfEven(cents: number): number {
  const floor = Math.floor(cents)
  const diff = cents - floor
  if (diff < 0.5) return floor
  if (diff > 0.5) return floor + 1
  return floor % 2 === 0 ? floor : floor + 1
}
