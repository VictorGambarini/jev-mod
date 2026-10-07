// IO: everything jev-mod may do to the outside world, and the only way features reach it.
//
// Claude Code's engine handle (`$`) never crosses a file boundary: the plugin validator follows
// `$` only into functions declared in the same file, and wants environment variables named by
// literal. So src/register.ts is the one file that holds `$`; it builds an IO from it and hands
// that to every feature, the engine and the core. A test hands them a fake IO instead.

export type FetchInit = { method?: string; headers?: Record<string, string>; body?: string }
export type FetchResponse = { status: number; ok: boolean; text: string }
export type RunResult = { exitCode: number; stdout: string; stderr: string }
export type Usage = { contextTokens: number; contextWindow?: number; contextPercent?: number }

export interface IO {
  // the outside world
  run(argv: string[], init?: { stdin?: string; timeoutMs?: number }): Promise<RunResult>
  fetch(url: string, init?: FetchInit): Promise<FetchResponse>
  readFile(path: string): Promise<string>
  writeFile(path: string, text: string): Promise<void>
  home(): Promise<string | undefined>
  // this session
  sessionId(): Promise<string | null>
  usage(): Promise<Usage>
  // the mod's own store (a JSON file Claude Code keeps per plugin)
  storeGet(key: string): Promise<unknown>
  storeSet(key: string, value: unknown): Promise<void>
  // telling the person
  status(text: string | undefined): void
  toast(text: string): void
  // commands
  runCommand(command: string, args?: string): Promise<unknown>
  after(ms: number, fn: () => void): void
}
