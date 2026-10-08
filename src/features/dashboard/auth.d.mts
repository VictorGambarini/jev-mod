// Types for auth.mjs (a plain .mjs because the dashboard server is spawned by node, not bundled).
export type AuthRequest = {
  method?: string
  path?: string
  query?: string
  host?: string
  origin?: string
  cookie?: string
  contentType?: string
  marker?: string
}
export type Authorized = { ok: boolean; via?: 'cookie' | 'query'; status?: number; reason?: string }
export type DashboardOp = { op: 'set' | 'reset'; scope: 'user' | 'project'; feature: string; key?: string; value?: unknown }

export function cookieName(port: number): string
export function same(a: unknown, b: unknown): boolean
export function cookie(header: string | undefined, name: string): string | undefined
export function hosts(port: number): string[]
export function authorize(req: AuthRequest, config: { port: number; token: string }): Authorized
export function opOf(body: unknown): { problem?: string; op?: DashboardOp }
