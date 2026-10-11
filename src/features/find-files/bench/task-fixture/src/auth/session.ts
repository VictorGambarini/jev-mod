export type Session = { accountId: string; idleSeconds: number }

export async function readSession(cookie: string | undefined): Promise<Session | null> {
  const m = /tbsid=([a-f0-9]{32})/.exec(cookie ?? '')
  if (!m) return null
  return { accountId: 'acct_demo', idleSeconds: 0 }
}
