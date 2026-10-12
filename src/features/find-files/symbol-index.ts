import { benchLedger } from '../../core/bench-overlay'
import type { IO } from '../../core/io'
import { alike, definitions, isIdentifier, isTestPath, langOf, normal, occurrences, type Def, type Kind, type Occurrence } from './symbols'

export { isTestPath }

// find-files' symbol lookup: `find_files` with `symbol` set. Where a name is defined, imported,
// called and used, in code only: never in a comment or a string, never inside a longer name. It
// asks no decision model: the answer is read from the code (symbols.ts), so it is exact about
// words and costs nothing.
//
//   - Occurrences: the files that hold the name as a whole word (git grep -w; ripgrep without git;
//     else every code file read), each read and stripped of comments and strings, each line given
//     its role.
//   - The index: every code file's definitions, kept per project folder under
//     <XDG_CACHE_HOME or ~/.cache>/jev-mod/find-files/ and keyed by each file's git blob, so a
//     commit or a checkout re-reads only the files it changed, and files changed but not committed
//     (or untracked) are read every time and never kept. It names the definitions alike to the one
//     asked for (refund_payment for refundPayment, refundPaymentLater), and lets a plain-words query
//     boost the files that define a name the model guessed. Building it has a time budget; what is
//     left is read on the next call. In a bench run it lives in the run's scratch folder instead.
//
// It fails open: anything that goes wrong reads as fewer files searched, never as a throw.

const VERSION = 1
/** Files read at once. */
const READ_AT_ONCE = 32
/** A file larger than this is not read (generated or data). */
const MAX_FILE = 1_000_000
/** How long one call may spend adding files to the index; the rest waits for the next call. */
export const INDEX_BUDGET_MS = 4000
/** At most this many files holding the name are read for its occurrences. */
export const MAX_HOLDERS = 400
/** At most this many lines are listed per role. */
export const MAX_LISTED = 40
const EXCERPT_CHARS = 110

// ── the index ────────────────────────────────────────────────────────────────

type Stored = { v: number; folder: string; files: Record<string, { b: string; d: [string, number, Kind][] }> }
export type SymbolIndex = { defs: Map<string, Def[]>; complete: boolean; files: number; cached: number }

const fnv = (text: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

/** Where the folder's index is kept, or null with no HOME and no XDG_CACHE_HOME. */
export async function indexPath(io: IO, folder: string): Promise<{ dir: string; file: string } | null> {
  const name = `symbols-${folder.replace(/[^A-Za-z0-9]+/g, '_').slice(-60)}-${fnv(folder)}.json`
  const bench = await benchLedger(io).catch(() => null)
  if (bench) return { dir: `${bench}/find-files-cache`, file: `${bench}/find-files-cache/${name}` }
  const home = await io.home()
  const cache = (await io.env('XDG_CACHE_HOME')) || (home ? `${home}/.cache` : '')
  if (!cache) return null
  return { dir: `${cache}/jev-mod/find-files`, file: `${cache}/jev-mod/find-files/${name}` }
}

/** git's blob id for each tracked file under the folder, and the files that differ from it (changed, or untracked). */
async function blobs(io: IO, folder: string): Promise<{ blob: Map<string, string>; dirty: Set<string> } | null> {
  try {
    const staged = await io.run(['git', '-C', folder, 'ls-files', '-s', '-z'], { timeoutMs: 10_000 })
    if (staged.exitCode !== 0) return null
    const blob = new Map<string, string>()
    for (const entry of staged.stdout.split('\0')) {
      const m = /^\d+ ([0-9a-f]+) \d\t(.+)$/s.exec(entry)
      if (m) blob.set(m[2]!, m[1]!)
    }
    const changed = await io.run(['git', '-C', folder, 'ls-files', '-m', '-o', '--exclude-standard', '-z'], { timeoutMs: 10_000 })
    const dirty = new Set(changed.exitCode === 0 ? changed.stdout.split('\0').filter(Boolean) : [...blob.keys()])
    return { blob, dirty }
  } catch {
    return null
  }
}

async function readStored(io: IO, file: string, folder: string): Promise<Stored['files']> {
  try {
    const stored = JSON.parse(await io.readFile(file)) as Stored
    if (stored.v === VERSION && stored.folder === folder && stored.files && typeof stored.files === 'object') return stored.files
  } catch { /* none yet, or unreadable: start over */ }
  return {}
}

async function writeStored(io: IO, where: { dir: string; file: string }, folder: string, files: Stored['files']): Promise<void> {
  try {
    const made = await io.run(['mkdir', '-p', '-m', '700', where.dir], { timeoutMs: 5000 })
    if (made.exitCode !== 0) return
    await io.writeFile(where.file, JSON.stringify({ v: VERSION, folder, files } satisfies Stored))
  } catch { /* the next call reads the files again */ }
}

/** Read and parse files a batch at a time until `deadline`; what is left is returned unread. */
async function readDefs(io: IO, folder: string, paths: readonly string[], deadline: number): Promise<{ done: Map<string, Def[]>; left: number }> {
  const done = new Map<string, Def[]>()
  let i = 0
  for (; i < paths.length && Date.now() < deadline; i += READ_AT_ONCE) {
    await Promise.all(paths.slice(i, i + READ_AT_ONCE).map(async path => {
      try {
        const text = await io.readFile(`${folder}/${path}`)
        done.set(path, text.length > MAX_FILE ? [] : definitions(text, langOf(path)!))
      } catch {
        done.set(path, [])
      }
    }))
  }
  return { done, left: Math.max(0, paths.length - i) }
}

/**
 * The definitions in the folder's code files: from the cache where a file's blob is unchanged,
 * read again where it changed, read every time (and not kept) where it is not committed. Without
 * git, every file is read within the budget and nothing is kept.
 */
export async function loadIndex(io: IO, folder: string, files: readonly string[], budgetMs = INDEX_BUDGET_MS): Promise<SymbolIndex> {
  const code = files.filter(p => langOf(p) !== null)
  const deadline = Date.now() + budgetMs
  const git = await blobs(io, folder)
  const where = git ? await indexPath(io, folder) : null
  const stored = where ? await readStored(io, where.file, folder) : {}
  const defs = new Map<string, Def[]>()
  const toRead: string[] = []
  let cached = 0
  for (const path of code) {
    const b = git?.blob.get(path)
    const hit = b && !git!.dirty.has(path) ? stored[path] : undefined
    if (hit && hit.b === b) { defs.set(path, hit.d.map(([name, line, kind]) => ({ name, line, kind }))); cached++ } else toRead.push(path)
  }
  const { done, left } = await readDefs(io, folder, toRead, deadline)
  for (const [path, d] of done) defs.set(path, d)
  if (where && done.size) {
    const keep: Stored['files'] = {}
    for (const [path, d] of defs) {
      const b = git!.blob.get(path)
      if (b && !git!.dirty.has(path)) keep[path] = { b, d: d.map(x => [x.name, x.line, x.kind]) }
    }
    await writeStored(io, where, folder, keep)
  }
  return { defs, complete: left === 0, files: code.length, cached }
}

/** The files (relative to the folder) that define a name equal to one of `names` (normal forms, as namesOf gives them). */
export function definers(index: SymbolIndex, names: ReadonlySet<string>): Set<string> {
  const out = new Set<string>()
  if (!names.size) return out
  for (const [path, defs] of index.defs) if (defs.some(d => names.has(normal(d.name)))) out.add(path)
  return out
}

// ── occurrences ──────────────────────────────────────────────────────────────

/** The code files under the folder that hold `name` as a whole word: git grep, else ripgrep, else null (read them all). */
async function holders(io: IO, folder: string, name: string, git: boolean): Promise<{ paths: string[]; how: Lookup['how'] } | null> {
  const parse = (out: string) => out.split(/\0|\n/).filter(Boolean).map(p => p.replace(/^\.\//, '')).filter(p => langOf(p) !== null)
  if (git) {
    try {
      const ran = await io.run(['git', '-C', folder, 'grep', '--untracked', '-I', '-l', '-z', '-w', '-F', '-e', name, '--', '.'], { timeoutMs: 15_000 })
      if (ran.exitCode === 0 || ran.exitCode === 1) return { paths: ran.exitCode ? [] : parse(ran.stdout), how: 'git grep' }
    } catch { /* try ripgrep */ }
  }
  try {
    const rg = await io.run(['rg', '-l', '-0', '-w', '-F', '-e', name, '.'], { cwd: folder, timeoutMs: 15_000 })
    if (rg.exitCode === 0 || rg.exitCode === 1) return { paths: rg.exitCode ? [] : parse(rg.stdout), how: 'ripgrep' }
  } catch { /* no ripgrep: read them all */ }
  return null
}

export type Found = { path: string; line: number; text: string; occurrence: Occurrence }
export type Lookup = {
  name: string
  found: Found[]
  /** Definitions with a name alike to it, from the index. */
  alike: { name: string; path: string; line: number; kind: Kind }[]
  /** Files holding the word that were not read (past MAX_HOLDERS). */
  unread: number
  searched: number
  how: 'git grep' | 'ripgrep' | 'read'
  indexed: { complete: boolean; files: number }
}

const byPlace = (a: { path: string }, b: { path: string }) => Number(isTestPath(a.path)) - Number(isTestPath(b.path)) || a.path.localeCompare(b.path)

const excerpt = (line: string) => {
  const t = line.trim().replace(/\s+/g, ' ')
  return t.length > EXCERPT_CHARS ? `${t.slice(0, EXCERPT_CHARS - 3)}...` : t
}

/** Every occurrence of `name` in the folder's code, and the definitions alike to it. */
export async function lookup(io: IO, folder: string, files: readonly string[], git: boolean, name: string): Promise<Lookup> {
  const held = await holders(io, folder, name, git)
  const how: Lookup['how'] = held?.how ?? 'read'
  const candidates = held?.paths ?? files.filter(p => langOf(p) !== null)
  const reading = candidates.slice(0, MAX_HOLDERS)
  const found: Found[] = []
  await Promise.all(reading.map(async path => {
    try {
      const text = await io.readFile(`${folder}/${path}`)
      if (text.length > MAX_FILE) return
      const raw = text.split('\n')
      for (const o of occurrences(text, langOf(path)!, name)) found.push({ path, line: o.line, text: excerpt(raw[o.line - 1] ?? ''), occurrence: o })
    } catch { /* gone or unreadable */ }
  }))
  found.sort((a, b) => byPlace(a, b) || a.line - b.line)
  const index = await loadIndex(io, folder, files).catch(() => null)
  const similar: Lookup['alike'] = []
  if (index) {
    for (const [path, defs] of index.defs) for (const d of defs) if (alike(name, d.name)) similar.push({ name: d.name, path, line: d.line, kind: d.kind })
    similar.sort((a, b) => Number(isTestPath(a.path)) - Number(isTestPath(b.path)) || a.name.length - b.name.length || a.name.localeCompare(b.name) || a.path.localeCompare(b.path))
  }
  return { name, found, alike: similar, unread: Math.max(0, candidates.length - reading.length), searched: files.length, how,
    indexed: { complete: index?.complete ?? false, files: index?.files ?? 0 } }
}

// ── the answer ───────────────────────────────────────────────────────────────

const ROLES: { role: Occurrence['role']; title: string }[] = [
  { role: 'definition', title: 'defined' },
  { role: 'call', title: 'called' },
  { role: 'use', title: 'used (not called)' },
  { role: 'import', title: 'imported' },
]

/** The symbol answer as text for the model: counts first, then path:line and the line's text, by role. */
export function renderLookup(l: Lookup, folder: string): string {
  const count = (role: Occurrence['role']) => l.found.filter(f => f.occurrence.role === role).length
  const counts = ROLES.map(({ role }) => `${count(role)} ${role === 'definition' ? 'definition' : role === 'import' ? 'import' : role === 'call' ? 'call' : 'other use'}${count(role) === 1 ? '' : 's'}`)
  const tests = l.found.filter(f => isTestPath(f.path)).length
  const head = `${l.name} in ${folder}: ${counts.join(', ')}${tests ? ` (${tests} of them in tests, listed after the code)` : ''}; ` +
    `in code only (not in comments or strings, not inside longer names); ${l.searched} files searched (${l.how}).`
  const out = [head]
  for (const { role, title } of ROLES) {
    const mine = l.found.filter(f => f.occurrence.role === role)
    if (!mine.length) continue
    out.push(`${title}:`)
    for (const f of mine.slice(0, MAX_LISTED)) {
      const tag = role === 'definition' ? ` (${f.occurrence.kind})` : f.occurrence.member ? ' (as a member)' : ''
      out.push(`  ${f.path}:${f.line}${tag}  ${f.text}`)
    }
    if (mine.length > MAX_LISTED) out.push(`  ... and ${mine.length - MAX_LISTED} more`)
  }
  if (l.unread) out.push(`${l.unread} more file${l.unread === 1 ? '' : 's'} hold the word and were not read; narrow with \`path\`.`)
  if (!l.found.length) out.push(`${l.name} is not in this project's code.`)
  if (l.alike.length) {
    const shown = l.alike.slice(0, 8).map(a => `${a.name} (${a.kind}, ${a.path}:${a.line})`)
    out.push(`Other names alike, not counted above: ${shown.join('; ')}${l.alike.length > 8 ? `; and ${l.alike.length - 8} more` : ''}.`)
  }
  return out.join('\n')
}

/** Whether a symbol argument is one the lookup can take, with a reason when it is not. */
export function symbolProblem(symbol: string): string | null {
  if (!symbol) return 'find_files needs a `symbol` that is a name, such as refundPayment or refund_payment.'
  if (!isIdentifier(symbol)) return `find_files: "${symbol.slice(0, 80)}" is not one name; give \`symbol\` as an identifier (letters, digits, _ or $), or describe it in \`query\`.`
  return null
}
