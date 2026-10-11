// A bench site on a loopback port, for one arm of one case: Bun's own server (the bench runs with
// bun), answering through sites.ts's `handle`, and writing the site's log to a file after each
// request so the checker can read it once the arm is done. Started by task.ts's beforeArm,
// stopped after the arm was checked. Nothing here runs in the mod or in its tests.

import { handle, newState, type SiteId } from './sites'

// the few web types used, typed here: the repo carries no DOM or Bun types
type Request = { method: string; url: string; headers: { get(name: string): string | null }; text(): Promise<string> }
type Response = unknown
type ResponseCtor = new (body: string | null, init: { status: number; headers: Record<string, string> }) => Response
type BunServer = { port: number; stop(force?: boolean): void }
type BunLike = {
  serve(o: { hostname: string; port: number; fetch(req: Request): Promise<Response> }): BunServer
  write(path: string, text: string): Promise<number>
  file(path: string): { text(): Promise<string>; exists(): Promise<boolean> }
}

const bun = (): BunLike => {
  const b = (globalThis as unknown as { Bun?: BunLike }).Bun
  if (!b) throw new Error('the browser task bench runs under bun (bun src/bench/run.ts)')
  return b
}

/** Serve `site` on 127.0.0.1 at a free port, logging to `logPath`. */
export function serveSite(site: SiteId, logPath: string): { base: string; stop(): void } {
  const b = bun()
  const state = newState(site)
  let writing = Promise.resolve(0)
  const server = b.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url)
      const res = handle(state, { method: req.method, url: url.pathname + url.search, cookie: req.headers.get('cookie') ?? undefined,
        contentType: req.headers.get('content-type') ?? undefined, body: req.method === 'POST' ? await req.text() : undefined })
      writing = writing.then(() => b.write(logPath, state.log.map(h => JSON.stringify(h)).join('\n') + '\n'))
      await writing
      const Res = (globalThis as unknown as { Response: ResponseCtor }).Response
      return new Res(res.body || null, { status: res.status, headers: res.headers })
    },
  })
  return { base: `http://127.0.0.1:${server.port}/`, stop: () => server.stop(true) }
}

/** The log a site wrote, line by line; empty when it served nothing. */
export async function readLog(logPath: string): Promise<string> {
  const f = bun().file(logPath)
  return (await f.exists()) ? await f.text() : ''
}
