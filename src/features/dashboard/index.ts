import { dayOf, activity } from '../../core/activity'
import { modDir, paths, problems, reset, snapshot, write } from '../../core/config'
import { hostOf } from '../../core/host'
import type { IO } from '../../core/io'
import { FEATURES } from '../../core/registry'
import { isPrivate, jevDir } from '../../core/settings'
import { BackendError } from '../../engine/backends'
import { activeBackend } from '../../engine/client'
import { backendKeySource, keySource, provider } from '../../engine/keys'
import { limitConfig } from '../../engine/lanes'
import { VERSION } from '../../version'
import { build, embed, lastDays, lines, pageWith, readLine, remember, type Answer, type BackendView, type Op, type State } from './state'

// /jev-mod dashboard: a page in the browser to see and set every feature.
//
// A mod cannot listen on a port, so it starts server.mjs with bun or node and reads its stdout.
// The server serves the page and a state file this module writes; a change on the page comes
// back as a JSON line, is checked against the registry and written with config.write, and the
// state file is rewritten with the answer (state.ts says what each line holds). The server never
// writes a config file, and it dies with this module (or when `/jev-mod dashboard stop` ends it).
//
// With neither bun nor node, the same page is written once as a file with the state inside it,
// read-only.
//
// JEV_MOD_DASHBOARD (comma-separated) is for testing: no-browser opens nothing, static writes the
// read-only page even when a runtime is there.

const DAYS = 14

type Running = { url: string; pid: number; stop: () => void; ended: boolean }

let running: Running | null = null
let seq = 0
let answered: Record<string, Answer> = {}

function flags(value: string | undefined): Set<string> {
  return new Set((value ?? '').split(',').map(s => s.trim()).filter(Boolean))
}

async function readJson(io: IO, path: string): Promise<any> {
  try { return JSON.parse(await io.readFile(path)) } catch { return undefined }
}

/** The dashboard's run folder: the state file and the read-only page. */
async function runDir(io: IO): Promise<string> {
  const id = (await io.sessionId().catch(() => null)) ?? 'session'
  return `${await modDir(io)}/dashboard/${id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)}`
}

function dashboardDir(io: IO): string {
  return `${io.pluginRoot().replace(/\/\.claude-plugin\/?$/, '').replace(/\/+$/, '')}/src/features/dashboard`
}

let backendSeen: { at: number; view: BackendView | null } | null = null

/** Which backend and where its key comes from; never the key. Read once a minute at most (key lookup may run secret-tool). */
async function backendView(io: IO, now: number): Promise<BackendView | null> {
  if (backendSeen && now - backendSeen.at < 60_000) return backendSeen.view
  backendSeen = { at: now, view: await readBackend(io) }
  return backendSeen.view
}

async function readBackend(io: IO): Promise<BackendView | null> {
  try {
    const host = hostOf(io)
    let backend = null
    let misconfigured: string | null = null
    try {
      backend = await activeBackend(host)
    } catch (error) {
      misconfigured = error instanceof BackendError ? error.message : 'backends.json could not be read'
    }
    const chosen = await provider(host)
    const source = backend ? await backendKeySource(host, backend) : chosen === 'absent' ? 'none' : await keySource(host, chosen)
    return {
      name: backend?.name ?? null, model: backend?.model ?? null, provider: chosen, keySource: source, misconfigured,
      private: await isPrivate(io, await jevDir(io)),
    }
  } catch {
    return null
  }
}

/** Everything the page shows, read now. */
export async function gather(io: IO, mode: State['mode']): Promise<State> {
  const now = Date.now()
  const snap = await snapshot(io)
  const dir = await jevDir(io)
  const limits = limitConfig(await readJson(io, `${dir}/limits.json`))
  const spent = await readJson(io, `${dir}/limits.state.json`)
  const day = dayOf(now)
  return build({
    version: VERSION, seq: ++seq, now, mode, features: FEATURES, snap, problems: problems(snap),
    paths: await paths(io), activity: await activity(io, DAYS, now), days: lastDays(now, DAYS, dayOf),
    budget: { day, spent: spent?.day === day ? Number(spent.usd ?? 0) : 0, daily: limits.daily_usd },
    backend: await backendView(io, now), answered,
  })
}

/** Apply one change the page asked for; the registry checks it (config.write). */
export async function apply(io: IO, op: Op): Promise<Answer> {
  try {
    const done = op.op === 'reset' ? await reset(io, op.scope, op.feature)
      : await write(io, op.scope, op.feature, op.key, op.value === null ? undefined : op.value)
    return 'problem' in done ? { ok: false, error: done.problem } : { ok: true, message: `written to ${done.path}` }
  } catch (error) {
    return { ok: false, error: `could not write: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** bun, else node: the first that answers its --version. */
async function runtime(io: IO): Promise<string | null> {
  for (const name of ['bun', 'node']) {
    try {
      if ((await io.run([name, '--version'], { timeoutMs: 5000 })).exitCode === 0) return name
    } catch { /* not there */ }
  }
  return null
}

async function open(io: IO, target: string): Promise<boolean> {
  if (flags(await io.env('JEV_MOD_DASHBOARD')).has('no-browser')) return false
  try {
    const os = (await io.run(['uname', '-s'], { timeoutMs: 5000 })).stdout.trim()
    const ran = await io.run([os === 'Darwin' ? 'open' : 'xdg-open', target], { timeoutMs: 10_000 })
    return ran.exitCode === 0
  } catch {
    return false
  }
}

/** Start the server and wait for its ready line; null when it does not come. */
async function start(io: IO, bin: string, statePath: string, dir: string): Promise<Running | null> {
  const server = `${dir}/server.mjs`
  const stream = io.spawn([bin, server, statePath, `${dir}/page.html`])
  const it = stream[Symbol.asyncIterator]()
  let ready: (r: Running | null) => void = () => {}
  const started = new Promise<Running | null>(r => { ready = r })
  const me: Running = { url: '', pid: 0, ended: false, stop: () => {} }
  let refreshing: Promise<void> | null = null
  const writeState = async () => {
    try { await io.writeFile(statePath, JSON.stringify(await gather(io, 'live'))) } catch { /* the page keeps the last one */ }
  }
  const refresh = () => {
    refreshing ??= writeState().finally(() => { refreshing = null })
    return refreshing
  }
  // Changes one after another, so two quick clicks never interleave their writes.
  let applying: Promise<void> = Promise.resolve()
  me.stop = () => {
    me.ended = true
    void it.return?.()
    if (me.pid) void io.run(['kill', String(me.pid)], { timeoutMs: 5000 }).catch(() => {})
  }
  void (async () => {
    let rest = ''
    try {
      while (true) {
        const next = await it.next()
        if (next.done || me.ended) break
        const piece = next.value as { stream: string; text: string }
        if (piece.stream !== 'stdout') continue
        const got = lines(rest, piece.text)
        rest = got.rest
        for (const line of got.lines) {
          const msg = readLine(line, FEATURES)
          if (!msg) continue
          if (msg.kind === 'ready') {
            me.pid = msg.pid
            me.url = `http://127.0.0.1:${msg.port}/?t=${msg.token}`
            ready(me)
          } else if (msg.kind === 'refresh') {
            void refresh()
          } else {
            applying = applying.then(async () => {
              const answer: Answer = msg.kind === 'bad' ? { ok: false, error: msg.problem } : await apply(io, msg.op)
              answered = remember(answered, msg.kind === 'bad' ? msg.id : msg.op.id, answer)
              await writeState()
            })
          }
        }
      }
    } catch { /* it could not start, or it ended */ }
    me.ended = true
    if (running === me) running = null
    ready(null)
  })()
  const timeout = new Promise<null>(r => io.after(8000, () => r(null)))
  const got = await Promise.race([started, timeout])
  if (!got) me.stop()
  return got
}

async function writeStatic(io: IO, dir: string, run: string, why: string): Promise<{ text: string }> {
  const html = await io.readFile(`${dir}/page.html`)
  const state = await gather(io, 'static')
  const path = `${run}/dashboard.html`
  await io.writeFile(path, pageWith(html, `{"mode":"static","state":${embed(state)}}`))
  const opened = await open(io, `file://${path}`)
  return {
    text: `jev-mod dashboard: ${why}, so this is a read-only snapshot: ${path}${opened ? ' (opened in your browser)' : ''}.\n`
      + 'Change a setting with /jev-mod <feature> on|off|shadow or /jev-mod <feature> <setting> <value>.',
  }
}

export async function run(io: IO, action: 'open' | 'stop' = 'open'): Promise<{ text: string }> {
  if (action === 'stop') {
    if (!running) return { text: 'jev-mod dashboard: not running.' }
    running.stop()
    running = null
    return { text: 'jev-mod dashboard: stopped.' }
  }
  const dir = dashboardDir(io)
  const run = await runDir(io)
  const statePath = `${run}/state.json`
  if (running && !running.ended) {
    await io.writeFile(statePath, JSON.stringify(await gather(io, 'live')))
    const opened = await open(io, running.url)
    return { text: said(running.url, opened, true) }
  }
  const forced = flags(await io.env('JEV_MOD_DASHBOARD')).has('static')
  const bin = forced ? null : await runtime(io)
  if (!bin) return writeStatic(io, dir, run, forced ? 'asked for a static page' : 'neither bun nor node is on PATH')
  await io.writeFile(statePath, JSON.stringify(await gather(io, 'live')))
  const started = await start(io, bin, statePath, dir)
  if (!started) return writeStatic(io, dir, run, `the server (${bin}) did not start`)
  running = started
  const opened = await open(io, started.url)
  return { text: said(started.url, opened, false) }
}

function said(url: string, opened: boolean, again: boolean): string {
  return [
    `jev-mod dashboard${again ? ' (already running)' : ''}: ${url}`,
    `${opened ? 'Opened in your browser. ' : ''}It only works on this computer, while this session is open; /jev-mod dashboard stop ends it.`,
  ].join('\n')
}
