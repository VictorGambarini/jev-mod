import type { IO } from '../../core/io'
import type { Observation } from './rules'

// The browser as the mod sees it: a child process (driver.mjs, under node or bun) that holds
// Playwright and one page. A spawned child's standard input is one string, written once and
// closed, so it carries only the start (the URL, the hosts, and the input values, which then
// live in that process alone). Each command after that is one short `node client.mjs <socket>`
// run: the command on its standard input, the answer on its standard output, through a Unix
// socket the driver made (mode 0600, in a 0700 folder) and a token it printed once. Nothing of
// it is written to a file. The child dies with the spawn loop (the module unloading, the
// session ending, close()), when its parent goes away, or after a quiet spell.
//
// Playwright is not bundled: `/jev-mod browser install` puts a pinned copy and its Chromium in
// <cache>/jev-mod/browser/, and only that folder is read.

export const PLAYWRIGHT_VERSION = '1.62.1'

/** One action as the driver performs it. `expect` is what the element said when observed, so a changed page is not acted on. */
export type Wire = {
  kind: 'click' | 'type' | 'enter' | 'scroll' | 'back'
  ref?: string
  input?: string
  expect?: { tag: string; label: string }
}

export type ActResult = {
  ok: boolean
  obs?: Observation
  /** A navigation (or a redirect) went off the allowed hosts: the URL it went to. */
  left?: string
  /** The element was gone or said something else; obs is the page as it is now. */
  stale?: boolean
  error?: string
}

export interface Driver {
  observe(): Promise<Observation>
  act(action: Wire): Promise<ActResult>
  /** More input values, held in the driver's process (a resume that brings what needs_input asked for). */
  addInputs(values: Record<string, string>): Promise<void>
  /** Ends the browser and the child; never throws, never waits. */
  close(): void
}

export type LaunchOptions = {
  startUrl: string
  hosts: string[]
  headed: boolean
  /** A loopback CDP endpoint to attach to, or null for a throwaway headless Chromium. */
  cdp: string | null
  values: Record<string, string>
  textChars: number
  maxRows: number
}

export type Launched = { driver: Driver } | { status: 'not_installed' | 'failed'; reason: string }
export type Launch = (io: IO, o: LaunchOptions) => Promise<Launched>

/** Where the browser lives: <XDG_CACHE_HOME or ~/.cache>/jev-mod/browser (JEV_MOD_BROWSER_DIR names another copy). */
export async function browserDir(io: IO): Promise<string | null> {
  const named = (await io.env('JEV_MOD_BROWSER_DIR'))?.trim()
  if (named) return named.replace(/\/+$/, '')
  const home = await io.home()
  const cache = (await io.env('XDG_CACHE_HOME')) || (home ? `${home}/.cache` : '')
  return cache ? `${cache}/jev-mod/browser` : null
}

/** The installed Playwright's version, or null when there is none. */
export async function installed(io: IO, dir: string): Promise<string | null> {
  try {
    const version = JSON.parse(await io.readFile(`${dir}/node_modules/playwright/package.json`)).version
    return typeof version === 'string' ? version : null
  } catch {
    return null
  }
}

export const INSTALL_COMMAND = '/jev-mod browser install'

function featureDir(io: IO): string {
  return `${io.pluginRoot().replace(/\/\.claude-plugin\/?$/, '').replace(/\/+$/, '')}/src/features/browser`
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).trim().split('\n').slice(0, 2).join(' ').slice(0, 200)
}

/** node, else bun: Playwright is made for node. Else what each probe said. */
async function runtime(io: IO): Promise<{ bin: string } | { problem: string }> {
  const said: string[] = []
  for (const name of ['node', 'bun']) {
    try {
      const ran = await io.run([name, '--version'], { timeoutMs: 5000 })
      if (ran.exitCode === 0) return { bin: name }
      said.push(`${name} --version exited ${ran.exitCode}${ran.stderr.trim() ? `: ${errorText(ran.stderr)}` : ''}`)
    } catch (error) {
      said.push(`${name} could not be run: ${errorText(error)}`)
    }
  }
  return { problem: said.join('; ') }
}

const READY_MS = 45_000
const COMMAND_MS = 90_000

/** Start the driver and wait for its ready line. */
export const launchChild: Launch = async (io, o) => {
  const dir = await browserDir(io)
  if (!dir || !(await installed(io, dir))) {
    return { status: 'not_installed', reason: `Playwright is not installed for jev-mod; the person runs ${INSTALL_COMMAND} (it downloads Playwright ${PLAYWRIGHT_VERSION} and Chromium, about 150 MB, into ${dir ?? '~/.cache/jev-mod/browser'}).` }
  }
  const found = await runtime(io)
  if ('problem' in found) {
    return { status: 'failed', reason: `the browser runs under node (or bun), and neither could be started (${found.problem}); install Node.js or put it on PATH` }
  }
  const bin = found.bin
  const here = featureDir(io)
  const start = JSON.stringify({ ...o, runDir: `${dir}/run` })
  // Chromium is where the install put it; a copy named by JEV_MOD_BROWSER_DIR without one uses Playwright's own default.
  const own = (await io.folders(`${dir}/ms-playwright`)).length > 0
  const stream = io.spawn([bin, `${here}/driver.mjs`, dir], { input: start, ...(own ? { env: { PLAYWRIGHT_BROWSERS_PATH: `${dir}/ms-playwright` } } : {}) })
  const it = stream[Symbol.asyncIterator]()
  let ended = false
  const close = () => {
    if (ended) return
    ended = true
    void it.return?.(undefined)
  }
  type Ready = { socket: string; token: string } | { problem: string; code?: string }
  let settle: (r: Ready) => void = () => {}
  const ready = new Promise<Ready>(r => { settle = r })
  void (async () => {
    let rest = ''
    let err = ''
    try {
      while (!ended) {
        const next = await it.next()
        if (next.done) break
        const piece = next.value as { stream: string; text: string }
        if (piece.stream === 'stderr') { err = (err + piece.text).slice(-2000); continue }
        rest += piece.text
        let nl: number
        while ((nl = rest.indexOf('\n')) >= 0) {
          const line = rest.slice(0, nl).trim()
          rest = rest.slice(nl + 1)
          if (!line) continue
          try {
            const msg = JSON.parse(line)
            if (msg.ready && typeof msg.socket === 'string' && typeof msg.token === 'string') settle({ socket: msg.socket, token: msg.token })
            else if (typeof msg.error === 'string') settle({ problem: String(msg.message ?? msg.error), code: msg.error })
          } catch { /* not ours */ }
        }
      }
    } catch { /* it could not start, or it ended */ }
    ended = true
    settle({ problem: err.trim().split('\n').slice(-3).join(' ') || 'the browser process ended' })
  })()
  const timeout = new Promise<Ready>(r => io.after(READY_MS, () => r({ problem: 'the browser did not start in time' })))
  const got = await Promise.race([ready, timeout])
  if ('problem' in got) {
    close()
    if (got.code === 'not_installed' || got.code === 'no_browser') {
      return { status: 'not_installed', reason: `${got.problem.slice(0, 300)}; the person runs ${INSTALL_COMMAND}.` }
    }
    return { status: 'failed', reason: `the browser could not start: ${got.problem.slice(0, 400)}` }
  }
  const { socket, token } = got
  const send = async (command: Record<string, unknown>): Promise<any> => {
    if (ended) throw new Error('the browser has closed')
    const ran = await io.run([bin, `${here}/client.mjs`, socket], { stdin: JSON.stringify({ token, ...command }) + '\n', timeoutMs: COMMAND_MS })
    let reply: any
    try { reply = JSON.parse(ran.stdout.trim().split('\n').pop() ?? '') } catch { throw new Error(`the browser did not answer (${ran.stderr.trim().slice(0, 200) || `exit ${ran.exitCode}`})`) }
    if (reply?.ok !== true && !reply?.left && !reply?.stale) throw new Error(String(reply?.error ?? 'the browser refused the command'))
    return reply
  }
  const driver: Driver = {
    observe: async () => (await send({ op: 'observe' })).obs as Observation,
    act: async action => {
      try {
        return await send({ op: 'act', action }) as ActResult
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
    addInputs: async values => { await send({ op: 'inputs', inputs: values }) },
    close: () => {
      if (ended) return
      void send({ op: 'close' }).catch(() => {}).finally(close)
      io.after(3000, close)
    },
  }
  return { driver }
}

// ── /jev-mod browser install ─────────────────────────────────────────────────

/** Install the pinned Playwright and its Chromium into the browser folder. Only ever run when the person asks. */
export async function install(io: IO): Promise<{ text: string }> {
  const dir = await browserDir(io)
  if (!dir) return { text: 'jev-mod browser: no cache folder (HOME and XDG_CACHE_HOME are unset).' }
  const have = await installed(io, dir)
  const run = async (argv: string[], env?: Record<string, string>) => {
    try {
      return await io.run(argv, { cwd: dir, env, timeoutMs: 600_000 })
    } catch (error) {
      return { exitCode: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }
    }
  }
  const tail = (text: string) => text.trim().split('\n').slice(-6).join('\n')
  // The folder first (writing package.json makes it): a command run with a cwd that does not
  // exist fails to spawn, which once read as "npm is not on PATH".
  try {
    await io.writeFile(`${dir}/package.json`, JSON.stringify({ name: 'jev-mod-browser', private: true, description: 'Playwright for jev-mod\'s browse tool; delete this folder to remove it.' }, null, 2) + '\n')
  } catch (error) {
    return { text: `jev-mod browser: could not write ${dir}: ${error instanceof Error ? error.message : String(error)}` }
  }
  // npm's own probe runs with no cwd, so only npm itself can make it fail.
  let npm: { exitCode: number; stdout: string; stderr: string }
  try {
    npm = await io.run(['npm', '--version'], { timeoutMs: 30_000 })
  } catch (error) {
    npm = { exitCode: 1, stdout: '', stderr: error instanceof Error ? error.message : String(error) }
  }
  if (npm.exitCode !== 0) {
    const why = tail(npm.stderr || npm.stdout) || `exit ${npm.exitCode}`
    return { text: `jev-mod browser: npm --version failed (${why}); install Node.js (it brings npm) or put it on PATH, then run this again.` }
  }
  io.status(`installing Playwright ${PLAYWRIGHT_VERSION}…`)
  const lines: string[] = []
  if (have !== PLAYWRIGHT_VERSION) {
    const got = await run(['npm', 'install', '--no-audit', '--no-fund', '--save-exact', `playwright@${PLAYWRIGHT_VERSION}`])
    if (got.exitCode !== 0) {
      io.status(undefined)
      return { text: `jev-mod browser: npm install playwright@${PLAYWRIGHT_VERSION} failed in ${dir}:\n${tail(got.stderr || got.stdout)}` }
    }
    lines.push(`installed Playwright ${PLAYWRIGHT_VERSION} in ${dir}`)
  } else lines.push(`Playwright ${PLAYWRIGHT_VERSION} was already in ${dir}`)
  io.status('downloading Chromium for the browse tool…')
  const browsers = `${dir}/ms-playwright`
  const chromium = await run(['npx', '--no-install', 'playwright', 'install', 'chromium'], { PLAYWRIGHT_BROWSERS_PATH: browsers })
  io.status(undefined)
  if (chromium.exitCode !== 0) {
    return { text: [...lines, `npx playwright install chromium failed:`, tail(chromium.stderr || chromium.stdout)].join('\n') }
  }
  lines.push(`Chromium is in ${browsers}`)
  lines.push('The browse tool can start a browser now (/jev-mod browser on, if it is off). On Linux, a Chromium that will not start may need system libraries: `npx playwright install-deps chromium` (asks for sudo).')
  lines.push(`To remove it: delete ${dir}.`)
  return { text: `jev-mod browser:\n${lines.join('\n')}` }
}
