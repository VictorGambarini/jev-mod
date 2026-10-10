import * as activity from '../../core/activity'
import { modeOf, setting } from '../../core/config'
import { hostOf } from '../../core/host'
import type { IO } from '../../core/io'
import { coolingOff, recordCalls } from '../../core/jev'
import { limitsOf } from '../../core/limits'
import { isPrivate, jevDir } from '../../core/settings'
import { ask, costOf, JevError, type Answer, type Asked } from '../../engine/client'
import { isSensitive } from '../../engine/privacy'
import {
  bodyScore, byScore, cardOf, cardText, headOf, headScore, inside, pack, pathScore, rank, render, request,
  resolvePath, SKIP_DIRS, termsOf, wanted, type Candidate, type Outcome,
} from './rank'

// find-files: a tool the model calls to ask where the code that does something lives, instead
// of a chain of greps. The files under the folder are narrowed locally (rank.ts: path, first
// lines, how many lines mention the query's words); the best few dozen are sent as short,
// redacted cards and the decision model says which implement what the query describes.
//
// It always answers: with no key, in private mode, past the daily budget, during a backend
// cool-off, or on any failure, the local ranking comes back, labelled as such. A card that
// looks like it holds a secret is never sent, and neither is a query that does.

const ID = 'find-files'
/** The tool's short name; the model calls it as `mcp__jev-mod__find_files`. */
export const TOOL = 'find_files'
/** Files listed past this are not scored (a monorepo's long tail). */
export const MAX_FILES = 20_000
/** A walk (no git) stops after this many files. */
export const MAX_WALK_FILES = 5_000
const MAX_WALK_DIRS = 2_000
/** How many of the best files by path and body are read for their head, per candidate kept. */
const READ_FACTOR = 3
const MIN_READ = 120
/** Without git's counts, how many files a walk reads the head of. */
const MIN_READ_WALK = 400

export const SPEC = {
  name: TOOL,
  description: 'Find the files that implement something, described in plain words ("where retries with backoff are '
    + 'done", "the code that parses the config file"). Returns a ranked list of file paths, each with a short reason, '
    + 'so you can open the right file instead of running a chain of Grep and Glob calls. Use Grep instead when you '
    + 'know an exact name or string. It searches the project (or `path`, a folder inside it), skips build and dependency '
    + 'folders (and honours .gitignore in a git project), and sends the decision model only short cards made from '
    + 'each file\'s first lines.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What the code does, in plain words.' },
      path: { type: 'string', description: 'A folder to search, absolute or relative to the project root. Default: the project root.' },
      limit: { type: 'integer', minimum: 1, maximum: 50, description: 'How many files to return. Default: the `limit` setting (10 unless changed).' },
    },
    required: ['query'],
  },
  isDeferred: false,
}

/** Whether the tool should be offered to the model now. */
export async function offered(io: IO): Promise<boolean> {
  try { return (await modeOf(io, ID)) === 'on' } catch { return false }
}

// ── listing ──────────────────────────────────────────────────────────────────

type Listing = { files: string[]; git: boolean }

/** The files under `folder`, relative to it: git's list (tracked and untracked, .gitignore honoured), else a walk. */
export async function list(io: IO, folder: string): Promise<Listing> {
  try {
    const ran = await io.run(['git', '-C', folder, 'ls-files', '-co', '--exclude-standard', '-z'], { timeoutMs: 5000 })
    if (ran.exitCode === 0) {
      const files = ran.stdout.split('\0').filter(Boolean)
      if (files.length) return { files: files.filter(wanted).slice(0, MAX_FILES), git: true }
    }
  } catch { /* no git here: walk */ }
  return { files: await walk(io, folder), git: false }
}

/** A breadth-first walk that skips SKIP_DIRS and stops at MAX_WALK_FILES. */
async function walk(io: IO, folder: string): Promise<string[]> {
  const out: string[] = []
  let queue = ['']
  let dirs = 0
  while (queue.length && out.length < MAX_WALK_FILES && dirs < MAX_WALK_DIRS) {
    const next: string[] = []
    for (const rel of queue) {
      if (out.length >= MAX_WALK_FILES || dirs++ >= MAX_WALK_DIRS) break
      const abs = rel ? `${folder}/${rel}` : folder
      const [files, folders] = await Promise.all([io.files(abs), io.folders(abs)])
      for (const f of files) {
        const path = rel ? `${rel}/${f.name}` : f.name
        if (wanted(path)) out.push(path)
      }
      for (const d of folders) if (!SKIP_DIRS.has(d)) next.push(rel ? `${rel}/${d}` : d)
    }
    queue = next
  }
  return out.slice(0, MAX_WALK_FILES)
}

/**
 * How many lines of each file mention a term, from `git grep -c` (tracked and untracked files,
 * .gitignore honoured); null when git could not say, so the heads are read as a walk's are.
 */
async function grepCounts(io: IO, folder: string, terms: readonly string[]): Promise<Map<string, number> | null> {
  const counts = new Map<string, number>()
  try {
    const ran = await io.run(['git', '-C', folder, 'grep', '--untracked', '-I', '-i', '-c', '-F',
      ...terms.flatMap(t => ['-e', t]), '--', '.'], { timeoutMs: 5000 })
    if (ran.exitCode === 1) return counts // nothing matched
    if (ran.exitCode !== 0) return null
    for (const line of ran.stdout.split('\n')) {
      const colon = line.lastIndexOf(':')
      if (colon > 0) counts.set(line.slice(0, colon), Number(line.slice(colon + 1)) || 0)
    }
  } catch {
    return null
  }
  return counts
}

// ── the local step ───────────────────────────────────────────────────────────

/**
 * The best `keep` candidates: scored by path and body, the best few read for their head and
 * scored again. With git's counts, a file nothing matched in is not read; without them (a walk)
 * the head is the only look inside a file, so more are read, unmatched paths included.
 */
export async function narrow(io: IO, folder: string, files: readonly string[], terms: readonly string[], keep: number,
  counts: ReadonlyMap<string, number> | null): Promise<Candidate[]> {
  const first = byScore(files.map(path => ({ path, score: pathScore(path, terms) + bodyScore(counts?.get(path) ?? 0) })))
    .filter(c => counts === null || c.score > 0)
    .slice(0, Math.max(keep * READ_FACTOR, counts === null ? MIN_READ_WALK : MIN_READ))
  const read = await Promise.all(first.map(async c => {
    try {
      const head = headOf(await io.readFile(`${folder}/${c.path}`))
      return { ...c, head, score: c.score + headScore(head, terms) }
    } catch {
      return c
    }
  }))
  return byScore(read.filter(c => c.score > 0)).slice(0, keep)
}

// ── the decision model's step ────────────────────────────────────────────────

type Judged = { answers: Map<number, Answer>; note?: string; batches: number; failed: number }

/** The decision model's verdicts on the candidates it may see; a failure keeps what it had. */
async function judge(io: IO, query: string, candidates: readonly Candidate[], terms: readonly string[], timeoutMs: number): Promise<Judged> {
  const sendable = candidates.map((c, id) => ({ c, id })).filter(({ c }) => !isSensitive(cardText(c.path, c.head, terms)))
  if (!sendable.length) return { answers: new Map(), note: 'every candidate looked like it held a secret', batches: 0, failed: 0 }
  const cards = sendable.map(({ c }) => cardOf(c.path, c.head, terms))
  const host = hostOf(io)
  const limits = await limitsOf(io)
  const deadline = Date.now() + timeoutMs
  const calls: Asked[] = []
  const errors: string[] = []
  let refused: string | undefined
  const answers = new Map<number, Answer>()
  const batches = pack(cards)
  let failed = 0
  await Promise.all(batches.map(async ids => {
    if (limits) {
      const [allowed, reason] = await limits.admit(false)
      if (!allowed) { refused = reason || 'the daily budget is spent'; failed++; return }
    }
    const { state, questions } = request(query, cards, ids)
    try {
      const reply = await ask(host, state, questions, { timeoutMs: Math.max(0, deadline - Date.now()), retries: 0 })
      calls.push(reply)
      if (limits) await limits.charge(costOf(reply))
      for (const i of ids) {
        const answer = reply.answers[`f${i}`]
        if (answer) answers.set(sendable[i]!.id, answer)
      }
    } catch (error) {
      if (!(error instanceof JevError)) throw error
      errors.push(error.code)
      failed++
    }
  }))
  await recordCalls(io, calls, errors, ID)
  const note = answers.size ? undefined
    : errors.includes('no_key') ? 'no decision backend key'
      : refused ? `limits: ${refused}`
        : errors.length ? `the decision backend failed: ${errors[0]}` : undefined
  return { answers, note, batches: batches.length, failed }
}

// ── the tool ─────────────────────────────────────────────────────────────────

type Input = { query?: unknown; path?: unknown; limit?: unknown }

/** The tool's answer, as text for the model. Never throws: a failure is said in the text. */
export async function find(io: IO, input: Input): Promise<string> {
  try {
    const mine = await setting(io, ID)
    if (mine.mode !== 'on') return 'find_files is off (/jev-mod find-files on turns it on); use Glob and Grep.'
    const query = typeof input.query === 'string' ? input.query.trim() : ''
    if (!query) return 'find_files needs a query: what the code does, in plain words.'
    const knobLimit = Number(mine.knobs.limit?.value ?? 10)
    const limit = Math.max(1, Math.min(50, Math.trunc(typeof input.limit === 'number' ? input.limit : knobLimit) || knobLimit))
    const maxCandidates = Math.max(limit, Number(mine.knobs.maxCandidates?.value ?? 60))
    const timeoutMs = Number(mine.knobs.timeoutMs?.value ?? 8000)

    const root = await io.projectRoot()
    const given = typeof input.path === 'string' && input.path.trim() ? input.path.trim() : '.'
    if (!root && !given.startsWith('/')) return 'find_files: the project root is not known here; give `path` as an absolute folder.'
    const folder = resolvePath(root ?? '/', given)
    if (root && !inside(resolvePath('/', root), folder)) return `find_files searches inside the project (${root}) only; ${folder} is outside it.`

    const terms = termsOf(query)
    if (!terms.length) return `find_files: "${query}" has no words to search for; describe what the code does.`
    const listing = await list(io, folder)
    if (!listing.files.length) return `find_files: no files found under ${folder}.`
    const counts = listing.git ? await grepCounts(io, folder, terms) : null
    const candidates = await narrow(io, folder, listing.files, terms, maxCandidates, counts)
    const outcome: Outcome = { by: 'local', searched: listing.files.length, folder }
    if (!candidates.length) {
      void activity.count(io, ID, 'local-only')
      return render(query, [], limit, outcome)
    }

    let note: string | undefined
    let answers = new Map<number, Answer>()
    let unjudged: { batches: number; failed: number } | undefined
    if (await isPrivate(io, await jevDir(io))) note = 'private mode'
    else if (coolingOff()) note = 'the decision backend is cooling off after a failure'
    else if (isSensitive(query)) note = 'the query looks like it holds a secret'
    else {
      try {
        const judged = await judge(io, query, candidates, terms, timeoutMs)
        answers = judged.answers
        note = judged.note
        if (judged.failed) unjudged = { batches: judged.batches, failed: judged.failed }
      } catch {
        note = 'the decision model could not be asked'
      }
    }
    const ranked = rank(candidates, answers, terms)
    if (answers.size) {
      void activity.count(io, ID, 'ranked')
      return render(query, ranked, limit, { ...outcome, by: 'jev', ...(unjudged ? { batches: unjudged } : {}) })
    }
    void activity.count(io, ID, 'local-only')
    return render(query, ranked, limit, { ...outcome, note })
  } catch (error) {
    void activity.count(io, ID, 'failed')
    return `find_files failed (${error instanceof Error ? error.message : String(error)}); use Glob and Grep.`
  }
}
