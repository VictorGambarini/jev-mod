import type { IO } from './io'

// Each config file is read once per hook call, not once per lookup. A hook asks for a setting
// many times (every feature checks its own mode, the band checks several more, the gates look
// again), and in Claude Code each fs.read is a round trip to the host.
//
// The copy lives with the IO that register.tsx builds for the call (ioOf), so it is never
// reused by the next hook: a person editing config.json between prompts is seen at once. Inside
// a call two things drop it: a write to that file made through any IO (`changed`, called by
// ioOf's writeFile and by config.ts's edit, so a /jev-mod command that writes a setting and then
// refreshes the band reads its own change), and a short age, so a call held open for minutes
// (the browser) does not read a stale file. Only reads that go through hostOf use it.

const MAX_AGE_MS = 5000

type Held = { at: number; version: number; text: Promise<string | undefined> }
const copies = new WeakMap<IO, Map<string, Held>>()
const written = new Map<string, number>()

/** A file was written (by this process): the copies held of it, by any IO, are out of date. */
export function changed(path: string): void {
  written.set(path, (written.get(path) ?? 0) + 1)
}

/** The file's text, undefined when it cannot be read, from this call's copy when it has one. */
export function readOnce(io: IO, path: string): Promise<string | undefined> {
  let mine = copies.get(io)
  if (!mine) copies.set(io, mine = new Map())
  const held = mine.get(path)
  const version = written.get(path) ?? 0
  const now = Date.now()
  if (held && held.version === version && now - held.at < MAX_AGE_MS) return held.text
  const text = io.readFile(path).then(t => t, () => undefined)
  mine.set(path, { at: now, version, text })
  return text
}
