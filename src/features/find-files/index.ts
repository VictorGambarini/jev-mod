import * as activity from '../../core/activity'
import { ledgerTool } from '../../core/bench-overlay'
import { modeOf, setting } from '../../core/config'
import { hostOf } from '../../core/host'
import type { IO } from '../../core/io'
import { coolingOff, recordCalls } from '../../core/jev'
import { limitsOf } from '../../core/limits'
import { isPrivate, jevDir } from '../../core/settings'
import { ask, costOf, JevError, type Answer, type Asked, type Host } from '../../engine/client'
import type { Limits } from '../../engine/lanes'
import { isSensitive } from '../../engine/privacy'
import {
  bodyScore, byScore, cardOf, cardText, clearLead, headOf, headScore, inside, listOf, NAME_BOOST, namesOf, nameScore, pack,
  pathScore, placesFor, placesIn, rank, render, request, resolvePath, searchTerms, shownOf, SKIP_DIRS, testFactor, wanted,
  type Candidate, type Outcome, type Place, type Ranked, type Weights,
} from './rank'
import { definers, loadIndex, lookup, renderLookup, symbolProblem } from './symbol-index'

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
  description: 'Find where something is implemented in this project when you do not know the names the code uses: '
    + 'describe it in `query` ("where failed webhook deliveries are retried", "the code that decides whether a coupon still '
    + 'applies"). Returns the files that implement it, ranked, each with the lines to read first (definitions first), so one '
    + 'call replaces a chain of Grep, Glob and Read. Fill `identifiers` (names the code may give it: functions, classes, '
    + 'variables, files, in any case style) and `synonyms` (other words the code or its comments may use): the search matches '
    + 'words, so your guesses widen it. When it answers that nothing here implements it, the best matches by words were all '
    + 'judged unrelated.\n'
    + 'Or give `symbol`, one exact name, for where it is defined, imported, called and used: in code only (not in comments '
    + 'or strings, and not inside longer names: refundPayment never matches refundPaymentLater), with path:line for each. '
    + 'Use it for "where is X defined" and "what calls X".\n'
    + 'Not for one exact string or a file name you already know: Grep or Glob does that in one call. It searches the '
    + 'project (or `path`, a folder inside it), skips build and dependency folders and honours .gitignore; a plain-words '
    + 'query sends the decision model only short redacted cards made from each candidate file\'s first lines.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What the code does, in plain words. Give this or `symbol`.' },
      identifiers: { type: 'array', items: { type: 'string' }, description: 'With `query`: names the code may use for it (refundPayment, retry_policy, InvoiceRenderer, webhooks/dispatcher). Optional; your guesses, not facts.' },
      synonyms: { type: 'array', items: { type: 'string' }, description: 'With `query`: other words for it and related terms the code or its comments may use (refund: chargeback, reversal, money back). Optional.' },
      symbol: { type: 'string', description: 'One exact name (an identifier) to find the definitions, imports, calls and other uses of. Give this or `query`.' },
      path: { type: 'string', description: 'A folder to search, absolute or relative to the project root. Default: the project root.' },
      limit: { type: 'integer', minimum: 1, maximum: 50, description: 'With `query`: how many files to return. Default: the `limit` setting (10 unless changed).' },
    },
    required: [],
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
 * .gitignore honoured); null when git could not say, so the heads are read as a walk's are. The
 * terms go as one case-blind alternation: git's case-blind search for many fixed strings is two
 * orders of magnitude slower (25 s against 0.1 s for a dozen terms over 4,500 files).
 */
export async function grepCounts(io: IO, folder: string, terms: readonly string[]): Promise<Map<string, number> | null> {
  const counts = new Map<string, number>()
  if (!terms.length) return counts
  try {
    const ran = await io.run(['git', '-C', folder, 'grep', '--untracked', '-I', '-i', '-c', '-E',
      '-e', terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), '--', '.'], { timeoutMs: 5000 })
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

/** What narrows beyond the terms: how much each counts, and the names the model guessed. */
export type NarrowBy = { weights?: Weights; names?: ReadonlySet<string>; boost?: ReadonlyMap<string, number> }

/**
 * The best `keep` candidates: scored by path and body, the best few read for their head and
 * scored again. With git's counts, a file nothing matched in is not read; without them (a walk)
 * the head is the only look inside a file, so more are read, unmatched paths included. A file
 * that defines one of the guessed names (`names` in its head, `boost` from the symbol index)
 * gets NAME_BOOST.
 */
export async function narrow(io: IO, folder: string, files: readonly string[], terms: readonly string[], keep: number,
  counts: ReadonlyMap<string, number> | null, by: NarrowBy = {}): Promise<Candidate[]> {
  const first = byScore(files.map(path => ({ path, score: testFactor(path) * (pathScore(path, terms, by.weights) + bodyScore(counts?.get(path) ?? 0) + (by.boost?.get(path) ?? 0)) })))
    .filter(c => counts === null || c.score > 0)
    .slice(0, Math.max(keep * READ_FACTOR, counts === null ? MIN_READ_WALK : MIN_READ))
  const read = await Promise.all(first.map(async c => {
    try {
      const head = headOf(await io.readFile(`${folder}/${c.path}`))
      const named = by.boost?.has(c.path) ? 0 : nameScore(head.symbols, by.names ?? new Set())
      return { ...c, head, score: c.score + testFactor(c.path) * (headScore(head, terms, by.weights) + named) }
    } catch {
      return c
    }
  }))
  return byScore(read.filter(c => c.score > 0)).slice(0, keep)
}

// ── the decision model's step ────────────────────────────────────────────────

type Judged = { answers: Map<number, Answer>; note?: string; batches: number; failed: number }

/** What the decision model said about the candidates it may see, and every request it took. */
export type Asking = { answers: Map<number, Answer>; calls: Asked[]; errors: string[]; refused?: string; batches: number; failed: number; allSensitive?: true }

/**
 * Ask the decision model about the candidates, a batch at a time: a candidate that looks like it
 * holds a secret is never sent. `limits` is the daily budget, when there is one. A failed batch
 * leaves its candidates unanswered. The bench (bench/adapter.ts) asks through this too.
 */
export async function askAbout(host: Host, limits: Limits | undefined, query: string, candidates: readonly Candidate[],
  terms: readonly string[], timeoutMs: number): Promise<Asking> {
  const sendable = candidates.map((c, id) => ({ c, id })).filter(({ c }) => !isSensitive(cardText(c.path, c.head, terms)))
  if (!sendable.length) return { answers: new Map(), calls: [], errors: [], batches: 0, failed: 0, allSensitive: true }
  const cards = sendable.map(({ c }) => cardOf(c.path, c.head, terms))
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
  return { answers, calls, errors, ...(refused ? { refused } : {}), batches: batches.length, failed }
}

/** The decision model's verdicts on the candidates it may see; a failure keeps what it had. */
async function judge(io: IO, query: string, candidates: readonly Candidate[], terms: readonly string[], timeoutMs: number): Promise<Judged> {
  const asked = await askAbout(hostOf(io), await limitsOf(io), query, candidates, terms, timeoutMs)
  if (asked.allSensitive) return { answers: new Map(), note: 'every candidate looked like it held a secret', batches: 0, failed: 0 }
  await recordCalls(io, asked.calls, asked.errors, ID)
  const { answers, errors, refused } = asked
  const note = answers.size ? undefined
    : errors.includes('no_key') ? 'no decision backend key'
      : refused ? `limits: ${refused}`
        : errors.length ? `the decision backend failed: ${errors[0]}` : undefined
  return { answers, note, batches: asked.batches, failed: asked.failed }
}

// ── the tool ─────────────────────────────────────────────────────────────────

export type Input = { query?: unknown; path?: unknown; limit?: unknown; synonyms?: unknown; identifiers?: unknown; symbol?: unknown }

/** How long a plain-words query may spend on the symbol index for the model's guessed names. */
const NAMES_BUDGET_MS = 2500

/** The places of the files the answer will show, read now: each file once, a failure leaves it without. */
async function withPlaces(io: IO, folder: string, ranked: readonly Ranked[], limit: number, by: Outcome['by'], terms: readonly string[]):
  Promise<(Ranked & { places?: Place[] })[]> {
  const shown = new Set(shownOf(ranked, limit, by).map(r => r.path))
  let i = 0
  return Promise.all(ranked.map(async r => {
    if (!shown.has(r.path)) return r
    const max = placesFor(i++)
    try { return { ...r, places: placesIn(await io.readFile(`${folder}/${r.path}`), r.path, terms, max) } } catch { return r }
  }))
}

/** The symbol lookup: where `symbol` is defined and used, read from the code, no decision model. */
async function findSymbol(io: IO, folder: string, symbol: string): Promise<string> {
  const problem = symbolProblem(symbol)
  if (problem) return problem
  const listing = await list(io, folder)
  if (!listing.files.length) return `find_files: no files found under ${folder}.`
  const found = await lookup(io, folder, listing.files, listing.git, symbol)
  void activity.count(io, ID, 'symbol')
  return renderLookup(found, folder)
}

/** How an answer was reached, for the bench's ledger: by the decision model, the clear local lead, the local fallback, the symbol lookup, or none. */
type How = 'jev' | 'clear' | 'local' | 'symbol' | 'none'

/**
 * The tool's answer, as text for the model. Never throws: a failure is said in the text. In a
 * bench run, each call is written to the ledger with how it was answered (core/bench-overlay.ts).
 */
export async function find(io: IO, input: Input): Promise<string> {
  const { text, how } = await answer(io, input)
  await ledgerTool(io, { feature: ID, how })
  return text
}

async function answer(io: IO, input: Input): Promise<{ text: string; how: How }> {
  const none = (text: string) => ({ text, how: 'none' as const })
  try {
    const mine = await setting(io, ID)
    if (mine.mode !== 'on') return none('find_files is off (/jev-mod find-files on turns it on); use Glob and Grep.')
    const symbol = typeof input.symbol === 'string' ? input.symbol.trim() : ''
    const query = typeof input.query === 'string' ? input.query.trim() : ''
    if (!query && !symbol) return none('find_files needs a `query` (what the code does, in plain words) or a `symbol` (a name to find the definition and uses of).')
    const knobLimit = Number(mine.knobs.limit?.value ?? 10)
    const limit = Math.max(1, Math.min(50, Math.trunc(typeof input.limit === 'number' ? input.limit : knobLimit) || knobLimit))
    const maxCandidates = Math.max(limit, Number(mine.knobs.maxCandidates?.value ?? 60))
    const timeoutMs = Number(mine.knobs.timeoutMs?.value ?? 8000)
    const shortcut = mine.knobs.shortcut?.value !== false

    const root = await io.projectRoot()
    const given = typeof input.path === 'string' && input.path.trim() ? input.path.trim() : '.'
    if (!root && !given.startsWith('/')) return none('find_files: the project root is not known here; give `path` as an absolute folder.')
    const folder = resolvePath(root ?? '/', given)
    if (root && !inside(resolvePath('/', root), folder)) return none(`find_files searches inside the project (${root}) only; ${folder} is outside it.`)
    if (symbol) return { text: await findSymbol(io, folder, symbol), how: 'symbol' }

    const identifiers = listOf(input.identifiers)
    const { terms, queryTerms, weights } = searchTerms(query, [...listOf(input.synonyms), ...identifiers])
    if (!terms.length) return none(`find_files: "${query}" has no words to search for; describe what the code does.`)
    const listing = await list(io, folder)
    if (!listing.files.length) return none(`find_files: no files found under ${folder}.`)
    const counts = listing.git ? await grepCounts(io, folder, terms) : null
    const names = namesOf(identifiers)
    let boost: Map<string, number> | undefined
    if (names.size) {
      try {
        const index = await loadIndex(io, folder, listing.files, NAMES_BUDGET_MS)
        boost = new Map([...definers(index, names)].map(path => [path, NAME_BOOST]))
      } catch { /* the heads still show names */ }
    }
    const candidates = await narrow(io, folder, listing.files, terms, maxCandidates, counts, { weights, names, ...(boost ? { boost } : {}) })
    const outcome: Outcome = { by: 'local', searched: listing.files.length, folder }
    if (!candidates.length) {
      void activity.count(io, ID, 'local-only')
      return { text: render(query, [], limit, outcome), how: 'local' }
    }

    const lead = shortcut ? clearLead(candidates, queryTerms) : 0
    if (lead) {
      void activity.count(io, ID, 'clear')
      const ranked = rank(candidates, new Map(), terms)
      return { text: render(query, await withPlaces(io, folder, ranked, limit, 'clear', terms), limit, { ...outcome, by: 'clear', lead }), how: 'clear' }
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
      const text = render(query, await withPlaces(io, folder, ranked, limit, 'jev', terms), limit, { ...outcome, by: 'jev', ...(unjudged ? { batches: unjudged } : {}) })
      return { text, how: 'jev' }
    }
    void activity.count(io, ID, 'local-only')
    return { text: render(query, await withPlaces(io, folder, ranked, limit, 'local', terms), limit, { ...outcome, note }), how: 'local' }
  } catch (error) {
    void activity.count(io, ID, 'failed')
    return none(`find_files failed (${error instanceof Error ? error.message : String(error)}); use Glob and Grep.`)
  }
}
