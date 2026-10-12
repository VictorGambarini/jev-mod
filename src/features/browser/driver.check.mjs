// The real driver (driver.mjs and client.mjs, under node) against a static site served from a temp
// folder: observe, type, Enter, back, a stale check, a click, a link off the hosts, a bad token,
// close; and a single-page search box (which input a field holds, Enter with no form, results that
// say "Loading data..." for a second before they come), a page that loads its text late, and a long page read to 20,000 characters. The kit's tests cannot start processes, so this is a script:
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
    + '<h2>Plans</h2><a href="/pricing">Pricing</a> <a href="https://example.com/">Elsewhere</a> <a href="/spa">Single page</a> <a href="/covered">Covered</a> <a href="/framed">Framed</a> <a href="/poll">Poll</a> <a href="/product">Product</a> <a href="/long">Long</a>'
    + '<form role="search" action="/search"><input type="search" name="q" placeholder="Search"><button>Go</button></form></main>'
    + '<footer>Footer words</footer>',
  '/pricing': '<!doctype html><title>Pricing</title><main><h1>Pricing</h1><p>Team plan: $10 per seat.</p><button>Buy now</button></main>',
  '/search': '<!doctype html><title>Results</title><main><h1>Results</h1><p>Some results.</p></main>',
  // a single-page app: no form, Enter fetches, the results say loading for a second, the URL stays
  '/spa': '<!doctype html><title>Organisms</title><main><h1>Find an organism</h1>'
    + '<input id="q" aria-label="Microorganism" placeholder="Type a name"> <input aria-label="Other field" value="preset">'
    + '<div id="out">Nothing searched yet.</div><a href="/slow">Slow page</a></main><script>'
    + 'document.getElementById("q").addEventListener("keydown", e => { if (e.key !== "Enter") return;'
    + ' const out = document.getElementById("out"); out.textContent = "Loading data...";'
    + ' setTimeout(() => { out.innerHTML = "<p>Clonostachys rosea: 3 enzymes found.</p>" }, 1000) })</script>',
  // a button under a fixed banner, another one clear of it; a console error and a request that 404s
  '/covered': '<!doctype html><title>Covered</title><main><h1>Covered</h1><button id="under" onclick="document.title=\'Clicked under\'">Under</button>'
    + '<div style="margin-top:400px"><button id="clear" onclick="document.title=\'Clicked clear\'">Clear</button></div>'
    + '<div style="position:fixed;top:0;left:0;width:100%;height:200px;background:#fff">Subscribe to our newsletter</div></main>'
    + '<script>console.error("boom from the page"); fetch("/missing?token=zebra-query-77")</script>',
  // a visible frame (as a challenge frame is reported), and one too small to count
  '/framed': '<!doctype html><title>Framed</title><main><h1>Framed</h1><iframe src="/pricing?x=1#frame=challenge" width="300" height="200"></iframe>'
    + '<iframe src="/search?y=2" width="1" height="1"></iframe></main>',
  // a page that polls forever, and a button whose result comes from a request it starts, with no loading marker
  '/poll': '<!doctype html><title>Poll</title><main><h1>Poll</h1><input aria-label="Name"><button id="b">Fetch</button><div id="r"></div></main>'
    + '<script>setInterval(() => fetch("/api?poll=1"), 300); document.getElementById("b").onclick = () => '
    + 'fetch("/api").then(r => r.text()).then(t => { document.getElementById("r").textContent = t })</script>',
  // a list whose choice changes the price, and a table of what is in a cart
  '/product': '<!doctype html><title>Product</title><main><h1>Jacket</h1><p id="price">From $289</p>'
    + '<label>Size <select id="size"><option value="">Choose a size</option><option value="S">S</option><option value="XL">XL</option>'
    + '<option value="XXL" disabled>XXL</option></select></label>'
    + '<table><tr><th>Item</th><th>Qty</th></tr><tr><td>Merino Socks</td><td><p>2</p></td></tr></table></main>'
    + '<script>document.getElementById("size").onchange = e => { document.getElementById("price").textContent = e.target.value === "XL" ? "$309" : "$289" }</script>',
  // a long page: the line the goal wants lies at about 15,000 characters, the page goes on to about 30,000
  '/long': '<!doctype html><title>Long</title><main><h1>News</h1>' + '<p>Older news about the product, nothing about that here.</p>'.repeat(260)
    + '<p>Enterprise sales line: +64 9 555 0142.</p>' + '<p>Even older news, still nothing about that.</p>'.repeat(330) + '</main>',
  '/slow': '<!doctype html><title>Slow</title><main><h1>Slow</h1><div id="x" aria-busy="true">Loading</div></main><script>'
    + 'setTimeout(() => { const x = document.getElementById("x"); x.removeAttribute("aria-busy"); x.textContent = "Late text arrived." }, 1200)</script>',
}

const run = (args, input) => new Promise(resolve => {
  const child = execFile('node', args, { timeout: 60_000 }, (_error, stdout) => resolve(String(stdout)))
  child.stdin.end(input)
})

const server = createServer((req, res) => {
  if (req.url.startsWith('/api')) return setTimeout(() => res.end('Result arrived.'), 300)
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
    values: { query: 'zebra-query-77', size: 'xl' }, textChars: 20000, maxRows: 80, runDir }))
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
    const timings = []
    const send = async (cmd, token = ready.token) => {
      const t0 = Date.now()
      const reply = JSON.parse(await run([`${HERE}client.mjs`, ready.socket], JSON.stringify({ token, ...cmd }) + '\n'))
      if (cmd.op === 'act') timings.push({ kind: cmd.action.kind, ms: Date.now() - t0 })
      return reply
    }
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
    assert.equal(find('Search').holds, 'query', 'a field reports the input it holds, by name')
    assert.ok(!JSON.stringify(r).includes('zebra-query-77'), 'a value is typed, never echoed')
    r = await send({ op: 'act', action: { kind: 'enter', ref: box.id, expect: { tag: box.tag, label: box.label } } })
    assert.equal(r.obs.title, 'Results')
    r = await send({ op: 'act', action: { kind: 'back' } })
    const pricing = find('Pricing')
    assert.equal((await send({ op: 'act', action: { kind: 'click', ref: pricing.id, expect: { tag: 'a', label: 'Not it' } } })).stale, true)
    r = await send({ op: 'act', action: { kind: 'click', ref: pricing.id, expect: { tag: 'a', label: 'Pricing' } } })
    assert.match(r.obs.text, /Team plan: \$10 per seat\./)
    r = await send({ op: 'act', action: { kind: 'back' } })

    // The single-page search: the field holds the input by name; Enter with no form; the results wait.
    const spa = find('Single page')
    r = await send({ op: 'act', action: { kind: 'click', ref: spa.id, expect: { tag: 'a', label: 'Single page' } } })
    assert.equal(r.obs.title, 'Organisms')
    let organism = find('Microorganism')
    assert.deepEqual([organism.fillable, organism.filled, organism.holds, organism.form], [true, false, undefined, undefined]) // no form: Enter there is not a submit
    const other = find('Other field')
    assert.deepEqual([other.filled, other.holds], [true, undefined], 'text not from the inputs: filled, holding no input')
    assert.ok(!JSON.stringify(r).includes('preset'), 'a field\'s own value never leaves the driver')
    r = await send({ op: 'act', action: { kind: 'type', ref: organism.id, input: 'query', expect: { tag: organism.tag, label: organism.label } } })
    organism = find('Microorganism')
    assert.equal(organism.holds, 'query')
    const started = Date.now()
    r = await send({ op: 'act', action: { kind: 'enter', ref: organism.id, expect: { tag: organism.tag, label: organism.label } } })
    assert.equal(r.ok, true)
    assert.equal(r.obs.title, 'Organisms', 'the URL and title stay; only the results change')
    assert.match(r.obs.text, /Clonostachys rosea: 3 enzymes found\./, `the observation waited for the results (got: ${r.obs.text})`)
    assert.doesNotMatch(r.obs.text, /Loading data/)
    assert.ok(Date.now() - started >= 900, 'it waited for the loading marker to go')

    // A page whose text arrives late, marked aria-busy and "Loading" until then.
    const slow = find('Slow page')
    r = await send({ op: 'act', action: { kind: 'click', ref: slow.id, expect: { tag: 'a', label: 'Slow page' } } })
    assert.match(r.obs.text, /Late text arrived\./, `the observation waited for the late text (got: ${r.obs.text})`)
    r = await send({ op: 'act', action: { kind: 'back' } })
    r = await send({ op: 'act', action: { kind: 'back' } })
    assert.equal(r.obs.title, 'Home')

    // A covered button is not clicked, and says what covers it; one clear of the banner is.
    const covered = find('Covered')
    r = await send({ op: 'act', action: { kind: 'click', ref: covered.id, expect: { tag: 'a', label: 'Covered' } } })
    assert.ok(r.obs.events.some(e => e.kind === 'console' && /boom from the page/.test(e.text)), `a console error is reported (${JSON.stringify(r.obs.events)})`)
    assert.ok(r.obs.events.some(e => e.kind === 'network' && /\/missing answered 404/.test(e.text)), 'a failed request is reported')
    assert.ok(!JSON.stringify(r.obs.events).includes('zebra-query-77'), 'a request URL is reported without its query')
    const under = find('Under')
    r = await send({ op: 'act', action: { kind: 'click', ref: under.id, expect: { tag: under.tag, label: under.label } } })
    assert.match(String(r.covered), /Subscribe to our newsletter/, `the cover is named (${JSON.stringify(r).slice(0, 200)})`)
    assert.equal(r.obs.title, 'Covered', 'nothing was clicked')
    const clear = find('Clear')
    r = await send({ op: 'act', action: { kind: 'click', ref: clear.id, expect: { tag: clear.tag, label: clear.label } } })
    assert.equal(r.obs.title, 'Clicked clear')
    r = await send({ op: 'act', action: { kind: 'back' } })
    assert.equal(r.obs.title, 'Home')

    // A page that polls: a type does not wait out the poll; a click waits for the request it started.
    const poll = find('Poll')
    r = await send({ op: 'act', action: { kind: 'click', ref: poll.id, expect: { tag: 'a', label: 'Poll' } } })
    const name = find('Name')
    let t0 = Date.now()
    r = await send({ op: 'act', action: { kind: 'type', ref: name.id, input: 'query', expect: { tag: name.tag, label: name.label } } })
    assert.ok(Date.now() - t0 < 1500, `a type on a polling page is quick (${Date.now() - t0}ms)`)
    const fetchButton = find('Fetch')
    r = await send({ op: 'act', action: { kind: 'click', ref: fetchButton.id, expect: { tag: fetchButton.tag, label: fetchButton.label } } })
    assert.match(r.obs.text, /Result arrived\./, `the click waited for the request it started (got: ${r.obs.text})`)
    r = await send({ op: 'act', action: { kind: 'back' } })
    assert.equal(r.obs.title, 'Home')

    // A select lists its options (no placeholder, no disabled one) and which inputs fit; an option is chosen by its
    // place, a stale label is refused, an input that is no option fails at once; a table row reads as one line.
    const product = find('Product')
    r = await send({ op: 'act', action: { kind: 'click', ref: product.id, expect: { tag: 'a', label: 'Product' } } })
    let size = r.obs.elements.find(e => e.tag === 'select')
    assert.deepEqual([size.options, size.selected, size.fits], [['', 'S', 'XL', ''], 0, ['size']])
    assert.match(r.obs.text, /^Size$/m, 'nothing chosen: the label alone, no option text')
    assert.match(r.obs.text, /^Item \| Qty$/m, `a table's header row is one line (${r.obs.text})`)
    assert.match(r.obs.text, /^Merino Socks \| 2$/m, 'a table row is one line, its cells joined')
    const expect = { tag: size.tag, label: size.label }
    t0 = Date.now()
    r = await send({ op: 'act', action: { kind: 'type', ref: size.id, input: 'query', expect } })
    assert.deepEqual([r.ok, r.error], [false, 'no option of the list is that input'])
    assert.ok(Date.now() - t0 < 3000, `an input that is no option fails at once (${Date.now() - t0}ms)`)
    assert.equal((await send({ op: 'act', action: { kind: 'choose', ref: size.id, option: 2, optionLabel: 'S', expect } })).stale, true)
    r = await send({ op: 'act', action: { kind: 'choose', ref: size.id, option: 2, optionLabel: 'XL', expect } })
    assert.equal(r.ok, true)
    assert.match(r.obs.text, /\$309/, 'the choice took effect')
    assert.match(r.obs.text, /^Size \[chosen: XL\]$/m, `a select reads as the option chosen in it (${r.obs.text})`)
    size = r.obs.elements.find(e => e.tag === 'select')
    assert.deepEqual([size.selected, size.holds], [2, 'size'], 'the chosen option, and the input it matches')
    r = await send({ op: 'act', action: { kind: 'back' } })
    assert.equal(r.obs.title, 'Home')

    // A long page is read to 20,000 characters (what the mod asks for): a line at about 15,000 is in the text, the end is not.
    const long = find('Long')
    r = await send({ op: 'act', action: { kind: 'click', ref: long.id, expect: { tag: 'a', label: 'Long' } } })
    assert.match(r.obs.text, /Enterprise sales line: \+64 9 555 0142\./, 'a line past the first 6000 characters is read')
    assert.ok(r.obs.text.indexOf('Enterprise sales line') > 12000, 'it lies past the view the decision model reads')
    assert.ok(r.obs.text.length <= 20000 && r.obs.text.length > 19000, `read up to the cap (${r.obs.text.length})`)
    r = await send({ op: 'act', action: { kind: 'back' } })
    assert.equal(r.obs.title, 'Home')

    // Visible frames are reported (origin, path and the frame= marker; no query), a 1px one is not.
    const framed = find('Framed')
    r = await send({ op: 'act', action: { kind: 'click', ref: framed.id, expect: { tag: 'a', label: 'Framed' } } })
    assert.deepEqual(r.obs.frames, [`${base}pricing#frame=challenge`])
    r = await send({ op: 'wait', ms: 100 })
    assert.equal(r.obs.title, 'Framed', 'wait answers with the page')
    r = await send({ op: 'act', action: { kind: 'back' } })
    assert.equal(r.obs.title, 'Home')
    const away = find('Elsewhere')
    assert.deepEqual(await send({ op: 'act', action: { kind: 'click', ref: away.id, expect: { tag: 'a', label: 'Elsewhere' } } }), { left: 'https://example.com/' })
    assert.equal((await send({ op: 'observe' }, 'not-the-token')).error, 'bad token')
    assert.deepEqual(await send({ op: 'close' }), { ok: true })
    await new Promise(r => child.on('exit', r))
    const median = list => { const s = [...list].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }
    const kinds = [...new Set(timings.map(t => t.kind))]
    console.log(`timings (ms, client round trip included): ${kinds.map(k => `${k} median ${median(timings.filter(t => t.kind === k).map(t => t.ms))}`).join(', ')}; `
      + `all median ${median(timings.map(t => t.ms))}, total ${timings.reduce((a, t) => a + t.ms, 0)} over ${timings.length} actions`)
    console.log('ok: the driver observed, typed, submitted, went back, refused a stale target, clicked, stopped at the allowlist, '
      + 'reported the input a field holds, submitted a single-page search by Enter and waited out its loading, waited for a late page, '
      + 'refused a covered button, reported console errors, failed requests and visible frames, did not wait out a poll, '
      + 'waited for a request a click started, chose an option of a list and failed fast on an input that is none, read a table row as a line, '
      + 'read a long page to 20,000 characters, '
      + 'refused a bad token and closed')
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
