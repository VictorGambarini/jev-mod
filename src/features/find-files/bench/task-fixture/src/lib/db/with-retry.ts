import { log } from '../log'

// Re-runs a database call that failed with a serialization failure or a deadlock (SQLSTATE 40001 / 40P01).
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (error) {
      const code = (error as { code?: string }).code
      if ((code !== '40001' && code !== '40P01') || i >= attempts) throw error
      log.warn('retrying transaction', { attempt: i, code })
    }
  }
}
