import { log } from '../log'

// fetch() that retries network errors and 502/503/504 a couple of times, for our own internal service calls.
export async function retryingFetch(url: string, init: RequestInit = {}, retries = 2): Promise<Response> {
  let last: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, init)
      if (![502, 503, 504].includes(res.status)) return res
      last = new Error(`upstream said ${res.status}`)
    } catch (error) {
      last = error
    }
    log.warn('internal call failed, retrying', { url, attempt: i + 1 })
    await new Promise(r => setTimeout(r, 200 * (i + 1)))
  }
  throw last
}
