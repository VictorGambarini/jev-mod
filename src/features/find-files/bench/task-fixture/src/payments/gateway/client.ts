import { env } from '../../config/env'

export async function gatewayPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.payprovider.example/v2${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.PAYMENT_PROVIDER_SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw Object.assign(new Error(`gateway ${path} answered ${res.status}`), { status: res.status })
  return res.json() as Promise<T>
}
