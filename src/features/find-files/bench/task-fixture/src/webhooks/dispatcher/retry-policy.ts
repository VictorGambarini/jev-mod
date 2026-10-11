// When a delivery to a customer's endpoint is tried again after it failed.
// Attempt 1 is the first try; a delivery gets MAX_ATTEMPTS in all, then is parked as "failed" for a person to replay.
export const MAX_ATTEMPTS = 8

const SCHEDULE_SECONDS = [30, 120, 600, 1800, 7200, 21_600, 86_400]

export function nextAttemptDelaySeconds(failedAttempt: number): number | null {
  if (failedAttempt >= MAX_ATTEMPTS) return null
  return SCHEDULE_SECONDS[failedAttempt - 1] ?? 86_400
}

// A 4xx other than 408/429 means the customer's endpoint rejected the event itself; trying again will not help.
export function shouldRetry(status: number | null): boolean {
  if (status === null) return true
  if (status === 408 || status === 429) return true
  return status >= 500
}
