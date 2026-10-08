// Who may talk to the dashboard server: the one browser tab that was handed its token. Pure,
// no imports, so server.mjs (plain node or bun) and the kit tests (auth.test.ts) share it.
//
// A request is let through only when
//   - its Host is 127.0.0.1:<port> or localhost:<port>  (another name pointing here: DNS rebinding)
//   - it carries the token: the cookie set on first load, or `?t=` on GET / (that first load)
//   - a write (POST) also comes from the page's own origin, as JSON, with the X-Jev-Mod header
//     (a custom header a cross-site form or a simple fetch cannot send without a preflight,
//     and the server answers no preflight).

/** The cookie that carries the token; named by port, since cookies ignore ports. */
export function cookieName(port) {
  return `jevmod_${port}`
}

/** Equal strings, compared in time that does not depend on where they differ. */
export function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i % (a.length || 1)) || 0) ^ b.charCodeAt(i)
  return diff === 0 && a.length > 0
}

/** One cookie's value from a Cookie header, or undefined. */
export function cookie(header, name) {
  if (typeof header !== 'string') return undefined
  for (const part of header.split(';')) {
    const at = part.indexOf('=')
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim()
  }
  return undefined
}

/** The hosts this server answers to. */
export function hosts(port) {
  return [`127.0.0.1:${port}`, `localhost:${port}`]
}

/**
 * Whether to answer a request: { ok: true, via } or { ok: false, status, reason }.
 * `req` is { method, path, query (the `t` parameter), host, origin, cookie, contentType, marker }.
 */
export function authorize(req, { port, token }) {
  const refuse = (status, reason) => ({ ok: false, status, reason })
  const host = String(req.host ?? '').toLowerCase()
  if (!hosts(port).includes(host)) return refuse(403, 'wrong host')
  if (req.method !== 'GET' && req.method !== 'POST') return refuse(405, 'method not allowed')
  const fromCookie = same(cookie(req.cookie, cookieName(port)), token)
  const fromQuery = req.method === 'GET' && req.path === '/' && same(req.query, token)
  if (!fromCookie && !fromQuery) return refuse(403, 'no token')
  if (req.method === 'POST') {
    const origins = hosts(port).map(h => `http://${h}`)
    if (!origins.includes(String(req.origin ?? ''))) return refuse(403, 'wrong origin')
    if (!String(req.contentType ?? '').toLowerCase().startsWith('application/json')) return refuse(415, 'JSON only')
    if (req.marker !== '1') return refuse(403, 'missing X-Jev-Mod')
  }
  return { ok: true, via: fromCookie ? 'cookie' : 'query' }
}

/** What the page may ask the session to do, checked for shape only (the mod checks the values). */
export function opOf(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { problem: 'expected a JSON object' }
  const { op, scope, feature, key, value } = body
  if (op !== 'set' && op !== 'reset') return { problem: 'op must be set or reset' }
  if (scope !== 'user' && scope !== 'project') return { problem: 'scope must be user or project' }
  if (typeof feature !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(feature)) return { problem: 'bad feature' }
  if (op === 'reset') return { op: { op, scope, feature } }
  if (typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(key)) return { problem: 'bad key' }
  const kinds = ['string', 'number', 'boolean']
  if (value !== null && !kinds.includes(typeof value)) return { problem: 'value must be a string, number, boolean or null' }
  if (typeof value === 'string' && value.length > 200) return { problem: 'value too long' }
  return { op: { op, scope, feature, key, value } }
}
