import { benchLedger } from '../../core/bench-overlay'
import type { IO } from '../../core/io'

// Where /jev-mod compact saves each tool call and its full result before trimming the result:
// one folder per session, one file per pair, outside the person's project, so Claude can Read
// what was cut. <XDG_CACHE_HOME or ~/.cache>/jev-mod/compact/<session>/<tool_use_id>.txt, the
// folders 0700 and the files 0600. In a bench run the files go to the run's scratch folder
// instead (the overlay's ledger, under compact-files/), so a run leaves nothing in the cache.
// A session folder left untouched for KEEP_DAYS is removed at the next compaction.

export const KEEP_DAYS = 30
const DAY_MS = 24 * 60 * 60_000

const safe = (name: string) => name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 120)

/** The compaction root and this session's folder in it, or null with no HOME and no XDG_CACHE_HOME. */
export async function folderFor(io: IO): Promise<{ root: string; dir: string; session: string } | null> {
  const session = safe((await io.sessionId().catch(() => null)) || `session-${Date.now()}`)
  const bench = await benchLedger(io)
  if (bench) return { root: `${bench}/compact-files`, dir: `${bench}/compact-files/${session}`, session }
  const home = await io.home()
  const cache = (await io.env('XDG_CACHE_HOME')) || (home ? `${home}/.cache` : '')
  if (!cache) return null
  const root = `${cache}/jev-mod/compact`
  return { root, dir: `${root}/${session}`, session }
}

/**
 * Save each text under its name in `dir` (made 0700 first; each file 0600 once written). The
 * paths saved; a file that could not be written or made private is left out (its result is then
 * not trimmed), and none is written when the folder could not be made private.
 */
export async function save(io: IO, where: { root: string; dir: string }, files: ReadonlyMap<string, string>): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!files.size) return out
  try {
    const made = await io.run(['mkdir', '-p', '-m', '700', where.dir], { timeoutMs: 5000 })
    const shut = made.exitCode === 0 && (await io.run(['chmod', '700', where.root, where.dir], { timeoutMs: 5000 })).exitCode === 0
    if (!shut) return out
  } catch {
    return out
  }
  const written: [string, string][] = []
  for (const [name, text] of files) {
    const path = `${where.dir}/${safe(name)}.txt`
    try { await io.writeFile(path, text); written.push([name, path]) } catch { /* left whole */ }
  }
  if (!written.length) return out
  try {
    const shut = await io.run(['chmod', '600', '--', ...written.map(([, path]) => path)], { timeoutMs: 5000 })
    if (shut.exitCode !== 0) return out
  } catch {
    return out
  }
  for (const [name, path] of written) out.set(name, path)
  return out
}

/** Session folders under `root`, other than `keep`, with nothing changed in KEEP_DAYS, removed. Never throws. */
export async function prune(io: IO, root: string, keep: string, now = Date.now()): Promise<void> {
  try {
    const old: string[] = []
    for (const name of await io.folders(root)) {
      if (name === keep) continue
      const files = await io.files(`${root}/${name}`)
      const newest = Math.max(0, ...files.map(f => f.mtimeMs))
      if (now - newest > KEEP_DAYS * DAY_MS) old.push(`${root}/${name}`)
    }
    if (old.length) await io.run(['rm', '-rf', '--', ...old], { timeoutMs: 10_000 })
  } catch { /* the next compaction tries again */ }
}
