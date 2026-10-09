// The real driver (driver.mjs and client.mjs, under node) against a static site served from a temp
// folder: observe, type, Enter, back, a stale check, a click, a link off the hosts, a bad token,
// close. The kit's tests cannot start processes, so this is a script:
//
//   node src/features/browser/driver.check.mjs
//
// It needs Playwright and its Chromium: JEV_MOD_BROWSER_DIR (a folder with node_modules/playwright),
// else ~/.cache/jev-mod/browser (what `/jev-mod browser install` fills). Without them it says
// "skipped" and exits 0; it never installs anything.

import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const HERE = new URL('.', import.meta.url).pathname
const DIR = [process.env.JEV_MOD_BROWSER_DIR, `${process.env.HOME ?? ''}/.cache/jev-mod/browser`]
  .find(d => d && existsSync(join(d, 'node_modules/playwright/package.json')))
if (!DIR) {
  console.log('skipped: no Playwright (set JEV_MOD_BROWSER_DIR, or run /jev-mod browser install)')
  process.exit(0)
}

const PAGES = {
  '/': '<!doctype html><title>Home</title><nav><a href="/about">About</a></nav><main><h1>Welcome</h1><p>The shop.</p>'
    + '<h2>Plans</h2><a href="/pricing">Pricing</a> <a href="https://example.com/">Elsewhere</a>'
    + '<form role="search" action="/search"><input type="search" name="q" placeholder="Search"><button>Go</button></form></main>'
    + '<footer>Footer words</footer>',
  '/pricing': '<!doctype html><title>Pricing</title><main><h1>Pricing</h1><p>Team plan: $10 per seat.</p><button>Buy now</button></main>',
  '/search': '<!doctype html><title>Results</title><main><h1>Results</h1><p>Some results.</p></main>',
}

const run = (args, input) => new Promise(resolve => {
  const child = execFile('node', args, { timeout: 60_000 }, (_error, stdout) => resolve(String(stdout)))
  child.stdin.end(input)
})

const server = createServer((req, res) => {
  const page = PAGES[new URL(req.url ?? '/', 'http://x').pathname]
  res.writeHead(page ? 200 : 404, { 'content-type': 'text/html' })
  res.end(page ?? 'not here')
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`
const runDir = mkdtempSync(join(tmpdir(), 'jev-browser-'))
const child = spawn('node', [`${HERE}driver.mjs`, DIR], { stdio: ['pipe', 'pipe', 'inherit'] })
let code = 0
try {
  child.stdin.end(JSON.stringify({ startUrl: base, hosts: ['127.0.0.1'], headed: false, cdp: null,
    values: { query: 'zebra-query-77' }, textChars: 4000, maxRows: 80, runDir }))
  const ready = await new Promise((resolve, reject) => {
    let buf = ''
    child.stdout.on('data', d => {
      buf += d
      const line = buf.split('\n').find(l => l.trim())
      if (line) resolve(JSON.parse(line))
    })
    child.on('exit', c => reject(new Error(`driver exited ${c}`)))
  })
  if (ready.error) {
    console.log(`skipped: the driver could not start a browser (${ready.error}: ${ready.message})`)
  } else {
    const send = async (cmd, token = ready.token) => JSON.parse(await run([`${HERE}client.mjs`, ready.socket], JSON.stringify({ token, ...cmd }) + '\n'))
    let r = await send({ op: 'observe' })
    const find = label => r.obs.elements.find(e => e.label === label)
    assert.equal(r.obs.title, 'Home')
    assert.match(r.obs.text, /The shop\./)
    assert.doesNotMatch(r.obs.text, /Footer words/)
    assert.equal(find('Pricing').near, 'Plans')
    const box = find('Search')
    assert.deepEqual([box.role, box.fillable, box.filled, box.form.search], ['searchbox', true, false, true])
    r = await send({ op: 'act', action: { kind: 'type', ref: box.id, input: 'query', expect: { tag: box.tag, label: box.label } } })
    assert.equal(find('Search').filled, true)
    assert.ok(!JSON.stringify(r).includes('zebra-query-77'), 'a value is typed, never echoed')
    r = await send({ op: 'act', action: { kind: 'enter', ref: box.id, expect: { tag: box.tag, label: box.label } } })
    assert.equal(r.obs.title, 'Results')
    r = await send({ op: 'act', action: { kind: 'back' } })
    const pricing = find('Pricing')
    assert.equal((await send({ op: 'act', action: { kind: 'click', ref: pricing.id, expect: { tag: 'a', label: 'Not it' } } })).stale, true)
    r = await send({ op: 'act', action: { kind: 'click', ref: pricing.id, expect: { tag: 'a', label: 'Pricing' } } })
    assert.match(r.obs.text, /Team plan: \$10 per seat\./)
    r = await send({ op: 'act', action: { kind: 'back' } })
    const away = find('Elsewhere')
    assert.deepEqual(await send({ op: 'act', action: { kind: 'click', ref: away.id, expect: { tag: 'a', label: 'Elsewhere' } } }), { left: 'https://example.com/' })
    assert.equal((await send({ op: 'observe' }, 'not-the-token')).error, 'bad token')
    assert.deepEqual(await send({ op: 'close' }), { ok: true })
    await new Promise(r => child.on('exit', r))
    console.log('ok: the driver observed, typed, submitted, went back, refused a stale target, clicked, stopped at the allowlist, refused a bad token and closed')
  }
} catch (error) {
  console.error(`failed: ${error?.stack ?? error}`)
  code = 1
} finally {
  child.kill()
  server.close()
  rmSync(runDir, { recursive: true, force: true })
}
process.exit(code)
