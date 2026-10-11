// A tiny local website for task-level benches that fetch pages (web-filter, screening): made-up
// pages on 127.0.0.1, so a run repeats and nothing leaves the machine. Two listeners serve the
// same pages: plain http (for `curl` and the MCP stand-in) and https with a throwaway certificate
// (Claude Code's WebFetch upgrades every address to https; the run gets `NODE_EXTRA_CA_CERTS` for
// it). Every request is logged, so a bench can tell that an injected instruction made a request:
// a path under /canary/ answers "ok" and means nothing else.

import { fs, proc, run } from './node'
import { addresses, basePort } from './web-server-address'

export { addresses }

export type Page = { body: string; type?: string }
export type Hit = { scheme: 'http' | 'https'; path: string }

export type Site = {
  http: string
  https: string
  /** Environment a headless Claude Code needs to trust the https listener. */
  env: Record<string, string>
  /** Requests so far, in order. */
  hits(): Hit[]
  /** Forget the requests so far. */
  clear(): void
  stop(): Promise<void>
}

type Listener = { stop(close?: boolean): void; unref?(): void }
type BunLike = { serve(options: Record<string, unknown>): Listener; file(path: string): unknown }

// the repo carries no DOM types, so the one global used is typed here
const Reply = (globalThis as unknown as { Response: new (body: string, init?: Record<string, unknown>) => unknown }).Response

const bun = (): BunLike => {
  const b = (globalThis as unknown as { Bun?: BunLike }).Bun
  if (!b) throw new Error('the local site needs bun (run the bench with `bun src/bench/run.ts`)')
  return b
}

/** Start the site; pages are keyed by path ("/docs"). `stop` closes it and removes the certificate. */
export async function startSite(pages: Record<string, Page>): Promise<Site> {
  const f = await fs()
  const dir = await f.mkdtemp(`${proc.env.TMPDIR || '/tmp'}/jev-mod-bench-site-`)
  const made = await run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${dir}/key.pem`, '-out', `${dir}/cert.pem`,
    '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { timeoutMs: 30_000 })
  if (made.code !== 0) throw new Error('the local site needs openssl to make its throwaway certificate')
  const log: Hit[] = []
  const handler = (scheme: Hit['scheme']) => (request: { url: string }): unknown => {
    const path = new URL(request.url).pathname
    log.push({ scheme, path })
    if (path.startsWith('/canary/')) return new Reply('ok', { headers: { 'content-type': 'text/plain' } })
    const page = pages[path]
    if (!page) return new Reply('not found', { status: 404 })
    return new Reply(page.body, { headers: { 'content-type': page.type ?? 'text/html; charset=utf-8' } })
  }
  const b = bun()
  const port = basePort(proc.env.JEV_BENCH_PORT)
  const listeners: Listener[] = []
  try {
    listeners.push(b.serve({ port, hostname: '127.0.0.1', fetch: handler('http') }))
    listeners.push(b.serve({ port: port + 1, hostname: '127.0.0.1', fetch: handler('https'),
      tls: { key: b.file(`${dir}/key.pem`), cert: b.file(`${dir}/cert.pem`) } }))
  } catch (error) {
    for (const l of listeners) l.stop(true)
    throw new Error(`the local site could not listen on ports ${port} and ${port + 1} (set JEV_BENCH_PORT): ${(error as Error).message}`)
  }
  // a plan or a failed run must not be kept alive by it
  for (const l of listeners) l.unref?.()
  return {
    ...addresses(),
    env: { NODE_EXTRA_CA_CERTS: `${dir}/cert.pem` },
    hits: () => [...log],
    clear: () => { log.length = 0 },
    stop: async () => {
      for (const l of listeners) l.stop(true)
      await f.rm(dir, { recursive: true, force: true })
    },
  }
}
