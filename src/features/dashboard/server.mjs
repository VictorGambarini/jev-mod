// The /jev-mod dashboard's server: plain JS for `bun` or `node`, nothing but node:http, node:fs
// and node:crypto. It is started by the mod (features/dashboard/index.ts) and lives as long as
// the mod reads its output.
//
//   node server.mjs <state.json> <page.html>
//
// It binds 127.0.0.1 on a free port and prints one JSON line on stdout (and a blank line every
// few seconds, so it notices when nobody reads it):
//   {"ready":true,"port":<port>,"token":"<one-time token>","pid":<pid>}
// It never writes a config file. A change from the page becomes one JSON line on stdout,
//   {"id":"<op id>","op":"set","scope":"user","feature":"skills","key":"mode","value":"shadow"}
// which the mod checks against its registry, applies, and answers by rewriting <state.json>
// with answered[<op id>]. GET /api/state serves that file; when it is more than a couple of
// seconds old the server also prints {"op":"refresh"} so the mod rewrites it.
//
// Who may ask is auth.mjs's: the token (cookie, or ?t= on the first load), the Host, and for a
// write the page's own Origin and the X-Jev-Mod header.

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { authorize, cookieName, opOf } from './auth.mjs'

const [statePath, pagePath] = process.argv.slice(2)
if (!statePath || !pagePath) {
  process.stderr.write('usage: server.mjs <state.json> <page.html>\n')
  process.exit(2)
}

const token = randomBytes(24).toString('base64url')
const page = readFileSync(pagePath, 'utf8').replace('/*__BOOT__*/null', JSON.stringify({ mode: 'live' }))
const MAX_BODY = 4096
const WAIT_MS = 3000
const STALE_MS = 2000

let lastGood = null
let lastRefresh = 0
let ops = 0

function say(line) {
  process.stdout.write(JSON.stringify(line) + '\n')
}

/** The state file as the mod last wrote it; the last good copy while it is being rewritten. */
function state() {
  try {
    lastGood = JSON.parse(readFileSync(statePath, 'utf8'))
  } catch { /* half-written or not there yet */ }
  return lastGood
}

function refresh(now = Date.now()) {
  if (now - lastRefresh < STALE_MS) return
  lastRefresh = now
  say({ op: 'refresh' })
}

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
    + "connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
}

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, { ...HEADERS, 'Content-Type': type, 'Content-Length': Buffer.byteLength(text), ...extra })
  res.end(text)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) return reject(new Error('too large'))
    let size = 0
    let over = false
    const parts = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY) over = true
      else parts.push(chunk)
    })
    req.on('end', () => over ? reject(new Error('too large')) : resolve(Buffer.concat(parts).toString('utf8')))
    req.on('error', reject)
  })
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** Wait for the mod to answer op `id` in the state file, up to WAIT_MS. */
async function answer(id) {
  const until = Date.now() + WAIT_MS
  while (Date.now() < until) {
    const now = state()
    const done = now?.answered?.[id]
    if (done) return { done, state: now }
    await sleep(80)
  }
  return null
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const port = server.address().port
  const verdict = authorize({
    method: req.method, path: url.pathname, query: url.searchParams.get('t') ?? undefined,
    host: req.headers.host, origin: req.headers.origin, cookie: req.headers.cookie,
    contentType: req.headers['content-type'], marker: req.headers['x-jev-mod'],
  }, { port, token })
  if (!verdict.ok) return send(res, verdict.status, { error: verdict.reason })

  if (req.method === 'GET' && url.pathname === '/') {
    if (verdict.via === 'query') {
      // Trade the token in the URL for a cookie, and take it out of the address bar and history.
      return send(res, 303, '', 'text/plain', {
        'Set-Cookie': `${cookieName(port)}=${token}; HttpOnly; SameSite=Strict; Path=/`,
        Location: '/',
      })
    }
    return send(res, 200, page, 'text/html; charset=utf-8')
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
    const now = state()
    if (!now || Date.now() - (now.at ?? 0) > STALE_MS) refresh()
    return now ? send(res, 200, now) : send(res, 503, { error: 'the session has not written the state yet' })
  }
  if (req.method === 'POST' && url.pathname === '/api/op') {
    let body
    try {
      body = JSON.parse(await readBody(req))
    } catch (error) {
      const big = error?.message === 'too large'
      return send(res, big ? 413 : 400, { error: 'expected a small JSON body' }, undefined, big ? { Connection: 'close' } : {})
    }
    const checked = opOf(body)
    if (checked.problem) return send(res, 400, { error: checked.problem })
    const id = `op-${++ops}-${randomBytes(4).toString('hex')}`
    say({ id, ...checked.op })
    const got = await answer(id)
    if (!got) return send(res, 504, { error: 'the Claude Code session did not answer; is it still open?' })
    return send(res, got.done.ok ? 200 : 422, { ...got.done, state: got.state })
  }
  return send(res, 404, { error: 'not found' })
})

server.listen(0, '127.0.0.1', () => {
  say({ ready: true, port: server.address().port, token, pid: process.pid })
})

// Gone with the session: when the process that started it goes away, so does the server.
const parent = process.ppid
setInterval(() => {
  if (process.ppid !== parent) process.exit(0)
}, 3000).unref()
process.stdout.on('error', () => process.exit(0))
// A blank line now and then (the mod skips them): once nothing reads stdout any more (the mod
// that started it was unloaded), the write fails with EPIPE and the server exits above.
setInterval(() => { process.stdout.write('\n') }, 5000).unref()
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => process.exit(0))
