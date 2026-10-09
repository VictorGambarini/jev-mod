// The browse tool's browser: plain JS for node (or bun), holding Playwright and one page. Started
// by the mod (features/browser/child.ts) and alive as long as the mod reads its output.
//
//   node driver.mjs <playwright folder>      standard input: one JSON object, then closed
//     { startUrl, hosts, headed, cdp, values, textChars, maxRows, runDir }
//
// Playwright is resolved from <playwright folder>/node_modules only (`/jev-mod browser install`
// puts a pinned copy there); nothing is bundled. It prints one line on stdout, then a blank line
// every few seconds (so it notices when nobody reads it any more):
//   {"ready":true,"pid":…,"socket":"<path>","token":"<random>"}     or     {"error":"<code>","message":"…"}
// and then answers commands, one JSON line each, on that Unix socket (mode 0600, in a 0700
// folder), every one carrying the token:
//   {"op":"observe"}                                   → {"ok":true,"obs":{…}}
//   {"op":"act","action":{kind,ref,input,expect}}      → {"ok":true,"obs":{…}} | {"left":"<url>"} | {"stale":true,"obs":{…}}
//   {"op":"inputs","inputs":{name:value}}              → {"ok":true}
//   {"op":"close"}                                     → {"ok":true}, then it exits
//
// Input values arrive on standard input or in an inputs command, are typed with fill(), and are
// never printed, logged or written anywhere. A main-frame navigation off the allowed hosts is
// aborted before it loads; a redirect that lands off them is reported as left. Default: a
// headless Chromium on a throwaway profile, closed at the end. With cdp: the person's own
// Chrome over the DevTools protocol, in a new tab of theirs that is the only one touched, and
// closed at the end; their browser is disconnected from, never closed.

import { createRequire } from 'node:module'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, mkdirSync, unlinkSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'

const [dir] = process.argv.slice(2)
const IDLE_MS = 6 * 60_000
const NAV_MS = 20_000

function say(line) {
  try { process.stdout.write(JSON.stringify(line) + '\n') } catch { /* nobody reads */ }
}

async function readStdin() {
  const parts = []
  for await (const chunk of process.stdin) parts.push(chunk)
  return Buffer.concat(parts).toString('utf8')
}

function hostOf(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.toLowerCase().replace(/\.$/, '') : null
  } catch {
    return null
  }
}

let hosts = []
function allowed(url) {
  if (url === 'about:blank') return true
  const host = hostOf(url)
  return !!host && hosts.some(h => host === h || host.endsWith(`.${h}`))
}

function loopback(endpoint) {
  try {
    const u = new URL(endpoint)
    return ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(u.hostname) && ['http:', 'ws:'].includes(u.protocol)
  } catch {
    return false
  }
}

// ── in the page ──────────────────────────────────────────────────────────────
// One function, sent with each evaluate (Playwright serialises it): nothing is left on window.

function inPage(arg) {
  const clean = s => (s || '').replace(/\s+/g, ' ').trim()
  const cap = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
  const visible = el => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) !== 0
  }
  const roleOf = el => {
    const given = el.getAttribute('role')
    if (given) return given
    const tag = el.tagName
    if (tag === 'A') return 'link'
    if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button'
    if (tag === 'SELECT') return 'combobox'
    if (tag === 'TEXTAREA') return 'textbox'
    if (tag === 'INPUT') {
      const t = (el.type || 'text').toLowerCase()
      if (t === 'checkbox' || t === 'radio') return t
      if (['submit', 'button', 'reset', 'image'].includes(t)) return 'button'
      if (t === 'search') return 'searchbox'
      if (t === 'range') return 'slider'
      return 'textbox'
    }
    if (el.isContentEditable) return 'textbox'
    return tag.toLowerCase()
  }
  const labelOf = el => {
    const aria = clean(el.getAttribute('aria-label'))
    if (aria) return aria
    const by = el.getAttribute('aria-labelledby')
    if (by) {
      const t = clean(by.split(/\s+/).map(id => document.getElementById(id)?.innerText || '').join(' '))
      if (t) return t
    }
    if (el.labels && el.labels.length) {
      const t = clean([...el.labels].map(l => l.innerText).join(' '))
      if (t) return t
    }
    if (el.tagName === 'INPUT') {
      const t = (el.type || 'text').toLowerCase()
      if (['submit', 'button', 'reset'].includes(t)) return clean(el.value) || t
      if (t === 'image') return clean(el.alt) || 'image'
      return clean(el.placeholder || el.title || el.name || t)
    }
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return clean(el.placeholder || el.title || el.name)
    const text = clean(el.innerText)
    if (text) return text
    const img = el.querySelector('img[alt]')
    if (img && clean(img.alt)) return clean(img.alt)
    return clean(el.title || el.getAttribute('href') || '')
  }

  if (arg.op === 'check') {
    const el = document.querySelector(`[data-jev-id="${CSS.escape(arg.ref)}"]`)
    if (!el || !visible(el)) return { same: false }
    return { same: el.tagName.toLowerCase() === arg.expect.tag && cap(labelOf(el), 120) === arg.expect.label }
  }
  if (arg.op === 'scroll') {
    window.scrollBy(0, Math.round(window.innerHeight * 0.8))
    return {}
  }

  // observe
  for (const el of document.querySelectorAll('[data-jev-id]')) el.removeAttribute('data-jev-id')
  const SEL = 'a[href],button,input:not([type=hidden]):not([type=file]),textarea,select,summary,'
    + '[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=radio],[role=switch],[role=option],'
    + '[role=combobox],[role=textbox],[role=searchbox],[contenteditable=""],[contenteditable=true]'
  const found = []
  let heading = ''
  for (const el of document.querySelectorAll(`${SEL},h1,h2,h3,h4,h5,h6`)) {
    if (/^H[1-6]$/.test(el.tagName)) {
      if (visible(el)) heading = cap(clean(el.innerText), 80)
      continue
    }
    if (el.disabled || el.closest('[aria-hidden=true],[inert]') || !visible(el)) continue
    if (el.parentElement?.closest(SEL) && !el.matches('input,textarea,select')) continue // a button inside a link: the link
    const r = el.getBoundingClientRect()
    found.push({ el, heading, inView: r.bottom > 0 && r.top < window.innerHeight })
  }
  const ordered = [...found.filter(f => f.inView), ...found.filter(f => !f.inView)].slice(0, arg.maxRows)
  const elements = ordered.map(({ el, heading }, i) => {
    const id = `e${i + 1}`
    el.setAttribute('data-jev-id', id)
    const role = roleOf(el)
    const tag = el.tagName.toLowerCase()
    const row = { id, tag, role, label: cap(labelOf(el), 120) }
    if (heading) row.near = heading
    if (tag === 'a' && el.href) row.href = el.href
    const fillable = (['textbox', 'searchbox', 'combobox'].includes(role) && (tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable))
      && !el.readOnly
    if (fillable) {
      row.fillable = true
      row.filled = tag === 'select' ? el.selectedIndex > 0 : el.isContentEditable ? clean(el.innerText) !== '' : String(el.value || '') !== ''
    }
    const form = el.form || el.closest('form')
    if (form) {
      const words = `${form.getAttribute('action') || ''} ${form.id} ${form.className} ${form.getAttribute('name') || ''}`
      const search = form.getAttribute('role') === 'search' || !!form.closest('[role=search]') || /search/i.test(words)
        || !!form.querySelector('input[type=search]')
      const submits = (tag === 'button' && (el.getAttribute('type') || 'submit').toLowerCase() === 'submit')
        || (tag === 'input' && ['submit', 'image'].includes((el.type || '').toLowerCase()))
      row.form = { search, submits }
    } else if (role === 'searchbox' || el.closest('[role=search]')) {
      row.form = { search: true, submits: false }
    }
    return row
  })

  // The main text: <main> (or the body), with navigation, banners and footers left out.
  const root = document.querySelector('main,[role=main]') || document.body
  const SKIP = 'nav,footer,aside,script,style,noscript,template,svg,[role=navigation],[role=contentinfo],[aria-hidden=true],[hidden]'
    + (root === document.body ? ',header,[role=banner]' : '')
  const BLOCK = 'p,li,h1,h2,h3,h4,h5,h6,div,section,article,tr,td,th,dd,dt,pre,blockquote,figcaption,label,form'
  let text = ''
  let lastBlock = null
  if (root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node && text.length < arg.textChars; node = walker.nextNode()) {
      const value = clean(node.nodeValue)
      const parent = node.parentElement
      if (!value || !parent || parent.closest(SKIP)) continue
      if (parent.checkVisibility && !parent.checkVisibility()) continue
      const block = parent.closest(BLOCK)
      text += text ? (block === lastBlock ? ' ' : '\n') + value : value
      lastBlock = block
    }
  }
  const scroller = document.scrollingElement || document.documentElement
  return {
    url: location.href,
    title: clean(document.title),
    text: text.slice(0, arg.textChars),
    elements,
    sensitive: !!document.querySelector('input[type=password],input[autocomplete^="cc-"],input[autocomplete="one-time-code"]'),
    more: scroller.scrollTop + window.innerHeight < scroller.scrollHeight - 10,
    canGoBack: history.length > 1,
    scrollY: Math.round(scroller.scrollTop),
  }
}

// ── the browser ──────────────────────────────────────────────────────────────

let cfg
let browser = null
let page = null
const ours = new Set() // the pages this driver opened
let attached = false
let leftTo = null
let values = {}

function guard(p) {
  ours.add(p)
  p.on('framenavigated', frame => {
    if (frame === p.mainFrame() && !allowed(frame.url())) leftTo ??= frame.url()
  })
  p.on('popup', popup => { guard(popup); page = popup })
  p.on('close', () => { ours.delete(p); if (page === p) page = [...ours].pop() ?? null })
  // A main-frame navigation off the allowed hosts never loads.
  return p.route('**/*', route => {
    const req = route.request()
    try {
      if (req.isNavigationRequest() && req.frame().parentFrame() === null && !allowed(req.url())) {
        leftTo ??= req.url()
        return route.abort('blockedbyclient')
      }
    } catch { /* a service worker's request: no frame */ }
    return route.continue()
  }).catch(() => {})
}

async function settle() {
  if (!page) return
  await page.waitForLoadState('domcontentloaded', { timeout: NAV_MS }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {})
  await page.waitForTimeout(150).catch(() => {})
}

async function observe() {
  if (!page) throw new Error('the page was closed')
  return page.evaluate(inPage, { op: 'observe', maxRows: cfg.maxRows, textChars: cfg.textChars })
}

async function act(a) {
  if (!page) throw new Error('the page was closed')
  leftTo = null
  const target = () => page.locator(`[data-jev-id="${String(a.ref).replace(/["\\]/g, '')}"]`).first()
  if (a.ref !== undefined) {
    const check = await page.evaluate(inPage, { op: 'check', ref: a.ref, expect: a.expect ?? { tag: '', label: '' } }).catch(() => ({ same: false }))
    if (!check.same) return { stale: true, obs: await observe() }
  }
  try {
    if (a.kind === 'click') {
      await target().click({ timeout: 8000 })
    } else if (a.kind === 'type') {
      const value = values[a.input]
      if (typeof value !== 'string') return { ok: false, error: 'no value for that input', obs: await observe() }
      const el = target()
      if ((await el.evaluate(e => e.tagName)) === 'SELECT') {
        await el.selectOption({ label: value }, { timeout: 5000 }).catch(() => el.selectOption(value, { timeout: 5000 }))
      } else {
        await el.fill(value, { timeout: 5000 })
      }
    } else if (a.kind === 'enter') {
      await target().press('Enter', { timeout: 5000 })
    } else if (a.kind === 'scroll') {
      await page.evaluate(inPage, { op: 'scroll' })
    } else if (a.kind === 'back') {
      await page.goBack({ timeout: NAV_MS }).catch(() => {})
    } else {
      return { ok: false, error: `unknown action ${a.kind}` }
    }
  } catch (error) {
    if (leftTo) return { left: leftTo }
    const message = String(error?.message ?? error).split('\n')[0].slice(0, 200)
    return { ok: false, error: message, obs: await observe().catch(() => undefined) }
  }
  await settle()
  if (leftTo) return { left: leftTo }
  if (page && !allowed(page.url())) return { left: page.url() }
  return { ok: true, obs: await observe() }
}

let shuttingDown = false
async function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  const hard = setTimeout(() => process.exit(code), 2500)
  hard.unref?.()
  try {
    for (const p of [...ours]) await p.close().catch(() => {})
    if (browser) await browser.close().catch(() => {}) // attached: disconnects, the person's Chrome stays
  } catch { /* going anyway */ }
  try { if (socketPath) unlinkSync(socketPath) } catch { /* gone */ }
  process.exit(code)
}

let socketPath = null

async function main() {
  try {
    cfg = JSON.parse(await readStdin())
  } catch {
    say({ error: 'bad_start', message: 'the start was not JSON' })
    process.exit(2)
  }
  hosts = Array.isArray(cfg.hosts) ? cfg.hosts.map(String) : []
  values = cfg.values && typeof cfg.values === 'object' ? { ...cfg.values } : {}
  cfg.values = undefined
  cfg.maxRows = Math.max(10, Math.min(200, Number(cfg.maxRows) || 80))
  cfg.textChars = Math.max(500, Math.min(50_000, Number(cfg.textChars) || 6000))
  if (!allowed(cfg.startUrl)) {
    say({ error: 'bad_start', message: 'the start URL is not inside the allowed hosts' })
    process.exit(2)
  }

  let playwright
  try {
    playwright = createRequire(join(dir, 'package.json'))('playwright')
  } catch (error) {
    say({ error: 'not_installed', message: `Playwright is not installed in ${dir}` })
    process.exit(3)
  }
  try {
    if (cfg.cdp) {
      if (!loopback(cfg.cdp)) throw new Error('the CDP endpoint must be on this machine (127.0.0.1 or localhost)')
      browser = await playwright.chromium.connectOverCDP(cfg.cdp, { timeout: 10_000 })
      attached = true
      const context = browser.contexts()[0] ?? await browser.newContext()
      page = await context.newPage()
    } else {
      browser = await playwright.chromium.launch({ headless: !cfg.headed })
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      page = await context.newPage()
    }
  } catch (error) {
    const message = String(error?.message ?? error).split('\n').slice(0, 2).join(' ').slice(0, 400)
    say({ error: /Executable doesn't exist|playwright install/i.test(message) ? 'no_browser' : 'launch', message })
    await shutdown(4)
    return
  }
  await guard(page)
  try {
    await page.goto(cfg.startUrl, { timeout: NAV_MS, waitUntil: 'domcontentloaded' })
  } catch (error) {
    if (!leftTo) {
      say({ error: 'start', message: `could not open ${cfg.startUrl}: ${String(error?.message ?? error).split('\n')[0].slice(0, 200)}` })
      await shutdown(5)
      return
    }
  }
  await settle()

  const token = randomBytes(24).toString('base64url')
  const tokenBytes = Buffer.from(token)
  const runDir = String(cfg.runDir || '/tmp')
  mkdirSync(runDir, { recursive: true, mode: 0o700 })
  try { chmodSync(runDir, 0o700) } catch { /* not ours to change */ }
  socketPath = join(runDir, `${randomBytes(6).toString('hex')}.sock`)
  if (socketPath.length > 100) socketPath = join('/tmp', `jev-mod-${process.getuid?.() ?? 'u'}-${randomBytes(6).toString('hex')}.sock`)

  let queue = Promise.resolve()
  let lastCommand = Date.now()
  const handle = async msg => {
    lastCommand = Date.now()
    if (msg.op === 'observe') {
      if (leftTo) return { left: leftTo }
      if (page && !allowed(page.url())) return { left: page.url() }
      return { ok: true, obs: await observe() }
    }
    if (msg.op === 'act') return act(msg.action ?? {})
    if (msg.op === 'inputs') {
      for (const [k, v] of Object.entries(msg.inputs ?? {})) if (typeof v === 'string') values[k] = v
      return { ok: true }
    }
    if (msg.op === 'close') {
      setTimeout(() => shutdown(0), 10)
      return { ok: true }
    }
    return { ok: false, error: `unknown op ${msg.op}` }
  }
  const server = createServer(conn => {
    let buf = ''
    conn.setEncoding('utf8')
    conn.on('data', chunk => {
      buf += chunk
      if (buf.length > 1_000_000) return conn.destroy()
      const nl = buf.indexOf('\n')
      if (nl < 0) return
      const line = buf.slice(0, nl)
      buf = ''
      let msg
      try { msg = JSON.parse(line) } catch { return conn.end(JSON.stringify({ ok: false, error: 'not JSON' }) + '\n') }
      const given = Buffer.from(String(msg?.token ?? ''))
      if (given.length !== tokenBytes.length || !timingSafeEqual(given, tokenBytes)) {
        return conn.end(JSON.stringify({ ok: false, error: 'bad token' }) + '\n')
      }
      queue = queue.then(() => handle(msg)).catch(error => ({ ok: false, error: String(error?.message ?? error).split('\n')[0].slice(0, 200) }))
        .then(reply => { conn.end(JSON.stringify(reply) + '\n') })
    })
    conn.on('error', () => {})
  })
  server.listen(socketPath, () => {
    try { chmodSync(socketPath, 0o600) } catch { /* best effort; the folder is 0700 */ }
    say({ ready: true, pid: process.pid, socket: socketPath, token, attached })
  })
  server.on('error', error => {
    say({ error: 'socket', message: String(error?.message ?? error).slice(0, 200) })
    void shutdown(6)
  })

  // Gone with whoever started it, and after a quiet spell (a pause lasts 5 minutes).
  const parent = process.ppid
  setInterval(() => {
    if (process.ppid !== parent || Date.now() - lastCommand > IDLE_MS) void shutdown(0)
  }, 3000).unref()
  setInterval(() => { try { process.stdout.write('\n') } catch { void shutdown(0) } }, 5000).unref()
}

process.stdout.on('error', () => { void shutdown(0) })
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => { void shutdown(0) })
main().catch(error => {
  say({ error: 'driver', message: String(error?.message ?? error).slice(0, 300) })
  void shutdown(1)
})
