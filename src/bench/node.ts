// What the bench needs from Node or Bun: files, processes, the clock, fetch. The mod's own code
// never runs here (it reaches the world through core/io.ts), and the repo carries no Node types,
// so the few calls used are typed below and loaded by name at run time.

export type Fs = {
  readFile(path: string, encoding: 'utf8'): Promise<string>
  writeFile(path: string, text: string): Promise<void>
  appendFile(path: string, text: string): Promise<void>
  mkdir(path: string, options: { recursive: true }): Promise<unknown>
  readdir(path: string): Promise<string[]>
  rm(path: string, options: { recursive: true; force: true }): Promise<void>
  cp(from: string, to: string, options: { recursive: true }): Promise<void>
  mkdtemp(prefix: string): Promise<string>
}

type Child = {
  stdout: { on(event: 'data', fn: (chunk: unknown) => void): void }
  stderr: { on(event: 'data', fn: (chunk: unknown) => void): void }
  stdin: { end(text?: string): void }
  on(event: 'close', fn: (code: number | null) => void): void
  on(event: 'error', fn: (error: Error) => void): void
  kill(signal?: string): void
}
type ChildProcess = { spawn(cmd: string, args: string[], options: { cwd?: string; env?: Record<string, string | undefined> }): Child }

export type Process = {
  argv: string[]
  env: Record<string, string | undefined>
  exitCode?: number
  cwd(): string
  stdout: { write(text: string): void }
  stderr: { write(text: string): void }
}

export const proc = (globalThis as unknown as { process: Process }).process

// Loaded by a name TypeScript does not resolve, so no Node types are needed to check this file.
const load = (name: string): Promise<unknown> => import(name)

export async function fs(): Promise<Fs> {
  return await load('node:fs/promises') as Fs
}

export const say = (text: string) => proc.stdout.write(text + '\n')
export const warn = (text: string) => proc.stderr.write(text + '\n')

export type Ran = { code: number | null; stdout: string; stderr: string; ms: number }

/** Run a program to the end, with a deadline; output decoded as UTF-8. */
export async function run(cmd: string, args: string[], options: { cwd?: string; env?: Record<string, string | undefined>; timeoutMs?: number; input?: string } = {}): Promise<Ran> {
  const cp = await load('node:child_process') as ChildProcess
  const started = Date.now()
  return new Promise(resolve => {
    const child = cp.spawn(cmd, args, { cwd: options.cwd, env: options.env ?? proc.env })
    const out: string[] = []
    const err: string[] = []
    const text = (chunk: unknown) => typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk as Uint8Array)
    child.stdout.on('data', c => out.push(text(c)))
    child.stderr.on('data', c => err.push(text(c)))
    const timer = options.timeoutMs ? setTimeout(() => child.kill('SIGTERM'), options.timeoutMs) : null
    const done = (code: number | null) => {
      if (timer !== null) clearTimeout(timer)
      resolve({ code, stdout: out.join(''), stderr: err.join(''), ms: Date.now() - started })
    }
    child.on('close', done)
    child.on('error', () => done(127))
    child.stdin.end(options.input ?? '')
  })
}

declare function clearTimeout(handle: unknown): void

/** The fetch the runtime provides. */
export const fetchFn = (globalThis as unknown as {
  fetch(url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: unknown }):
    Promise<{ status: number; text(): Promise<string>; headers: { forEach(fn: (value: string, key: string) => void): void } }>
}).fetch

export const AbortCtl = (globalThis as unknown as { AbortController: new () => { signal: unknown; abort(): void } }).AbortController

/** The repository root: the folder above src/. */
export function repoRoot(): string {
  const here = new URL('.', (import.meta as unknown as { url: string }).url).pathname
  return here.replace(/\/src\/bench\/?$/, '')
}
