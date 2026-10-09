// IO: everything jev-mod may do to the outside world, and the only way features reach it.
//
// Claude Code's engine handle (`$`) never crosses a file boundary: the plugin validator follows
// `$` only into functions declared in the same file, and wants environment variables named by
// literal. So src/register.tsx is the one file that holds `$`; it builds an IO from it and hands
// that to every feature, the engine and the core. A test hands them a fake IO instead.

export type FetchInit = { method?: string; headers?: Record<string, string>; body?: string }
export type FetchResponse = { status: number; ok: boolean; text: string; headers?: Record<string, string> }
export type RunResult = { exitCode: number; stdout: string; stderr: string }
export type SpawnPiece = { stream: 'stdout' | 'stderr'; text: string }
/** One transcript message, as `$.session.messages()` gives it: only what features read. */
export type TranscriptMessage = {
  role: 'user' | 'assistant'
  text: string
  toolUses?: readonly { tool: string; input?: Record<string, unknown>; text?: string; isError?: true }[]
}
export type Usage = { contextTokens: number; contextWindow?: number; contextPercent?: number }

export interface IO {
  /** One of the mod's settings (plugin.json userConfig): a secret field's value only ever goes to key lookup. */
  option(name: string): string | boolean | undefined
  // the outside world
  run(argv: string[], init?: { stdin?: string; timeoutMs?: number; cwd?: string; env?: Record<string, string> }): Promise<RunResult>
  /**
   * Start a long-lived child and stream its output; the loop over it is the child's life
   * (leaving it, `return()`, or the module unloading ends the child). `input` is written to its
   * standard input once, which is then closed.
   */
  spawn(argv: string[], init?: { cwd?: string; env?: Record<string, string>; input?: string }): AsyncIterable<SpawnPiece>
  fetch(url: string, init?: FetchInit): Promise<FetchResponse>
  readFile(path: string): Promise<string>
  /** The folders directly inside `path`, links to folders included; [] when it is not a folder. */
  folders(path: string): Promise<string[]>
  /** The plain files directly inside `path`, with when each was last changed; [] when it is not a folder. */
  files(path: string): Promise<{ name: string; mtimeMs: number }[]>
  writeFile(path: string, text: string): Promise<void>
  home(): Promise<string | undefined>
  /** An environment variable; the ones the engine reads by name are listed in register.tsx. */
  env(name: string): Promise<string | undefined>
  sleep(ms: number): Promise<void>
  /** The plugin's own folder (where plugin.json is), absolute: files it ships are under it. */
  pluginRoot(): string
  // this session
  sessionId(): Promise<string | null>
  /** The session's project root, absolute. */
  projectRoot(): Promise<string | undefined>
  /** The names of the skills the session lists for the model, or null when it cannot say. */
  skillNames(): Promise<string[] | null>
  usage(): Promise<Usage>
  /** The main conversation so far (the newest 4096 messages). */
  messages(): Promise<TranscriptMessage[]>
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
