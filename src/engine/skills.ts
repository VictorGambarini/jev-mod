// Skill selection: the one skill a turn needs, or none.
//
// Ported from jev-skills' jevkit/skillpick.py. One request per batch of 120 ranks the whole
// catalog against the turn (stage 1); the five likeliest are then read properly, each judged
// on its own, together with whether the turn needs a skill at all (stage 2). Most turns load
// nothing and the rest load the right one.
//
// Where skills are found is not ported: skillpick.discover walked every folder under a root,
// and a user's skills folder holds whole repositories (gstack keeps its test fixtures and an
// OpenClaw copy of itself there), so it offered skills Claude Code never lists. `discover`
// here reads the layout Claude Code reads, one SKILL.md per folder directly under a root.

import { tuned, type Backend } from './backends'
import { activeBackend, ask, choice, JevError, noul, type Asked, type Host } from './client'
import { isSensitive, redact } from './privacy'
import { isSpace, py, pyRound, splitlines, strip } from './pyre'

export const BATCH = 120
export const WORKERS = 8
// What the pool ranks in one round trip; past it the last skills found are left out, and the
// reply says how many.
export const MAX_SKILLS = BATCH * WORKERS
export const FINALISTS = 5
export const SHORTLIST_FLOOR = 0.02
export const DESCRIPTION_CHARS = 200
export const STAGE_TWO_CHARS = 600
export const SKILL_FILE_CHARS = 4000
export const META_SKILLS = ['using-superpowers', 'skill-selector', 'skill-selection']

export type Skill = { name: string; description: string; path: string }

const codePoints = (text: string, end: number) => Array.from(text).slice(0, end).join('')
const lstrip = (text: string) => {
  let at = 0
  for (const char of text) {
    if (!isSpace(char)) break
    at += char.length
  }
  return text.slice(at)
}
const stripQuotes = (text: string) => text.replace(/^['"]+|['"]+$/g, '')

// ── front matter ─────────────────────────────────────────────────────────────

// A block scalar header: `>` or `|`, then an indentation indicator and a chomping indicator in
// either order, then an optional comment (`>2-`, `|+2`, `> # folded`).
const BLOCK_HEADER = py('^[>|][0-9+-]*\\s*(?:#.*)?$')
const FENCE = py('^---\\s*\\n(.*?)\\n---\\s*\\n', 's')

/**
 * The front matter's fields, block scalars included, as skillpick._front_matter reads them.
 * Not a YAML parser: a block runs until a non-blank line is less indented than its first
 * line, its lines joined with spaces, `|` folded like `>` (the description is about to be
 * cut to a few hundred characters for a list anyway).
 */
export function frontMatter(text: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const match = FENCE.exec(text)
  if (!match || match.index !== 0) return fields
  const lines = splitlines(match[1]!)
  let index = 0
  while (index < lines.length) {
    const line = lines[index]!
    const colon = line.indexOf(':')
    const key = colon < 0 ? line : line.slice(0, colon)
    const value = colon < 0 ? '' : line.slice(colon + 1)
    if (colon < 0 || key.startsWith(' ') || key.startsWith('\t')) {
      index += 1
      continue
    }
    if (!BLOCK_HEADER.test(strip(value))) {
      fields[strip(key)] = stripQuotes(strip(value))
      index += 1
      continue
    }
    index += 1
    const body: string[] = []
    let indent: number | null = null
    while (index < lines.length) {
      const next = lines[index]!
      if (!strip(next)) {
        body.push('')
        index += 1
        continue
      }
      const width = Array.from(next).length - Array.from(lstrip(next)).length
      if (indent === null) indent = width
      else if (width < indent) break
      body.push(Array.from(next).slice(indent).join(''))
      index += 1
    }
    fields[strip(key)] = strip(body.filter(Boolean).join(' '))
  }
  return fields
}

// ── finding skills ───────────────────────────────────────────────────────────

/** What discover needs from the file system: a folder's entries, a file's text. */
export interface SkillFiles {
  /** The names of the folders directly inside `path` (links to folders included); [] if none. */
  folders(path: string): Promise<string[]>
  /** The file's text, or undefined when it cannot be read. */
  read(path: string): Promise<string | undefined>
}

/**
 * The skills under `roots`, each `<root>/<folder>/SKILL.md`, as Claude Code lays them out. The
 * first root to name a skill wins it; a skill with no description, a disabled one and the
 * selector meta-skills are left out. Folders are taken in name order, hidden ones skipped.
 */
export async function discover(files: SkillFiles, roots: string[], disabled: Iterable<string> = []): Promise<Skill[]> {
  const seen = new Map<string, Skill>()
  const skip = new Set(disabled)
  for (const root of roots) {
    const folders = (await files.folders(root)).filter(name => !name.startsWith('.')).sort()
    const texts = await Promise.all(folders.map(folder => files.read(`${root}/${folder}/SKILL.md`)))
    folders.forEach((folder, i) => {
      const text = texts[i]
      if (text === undefined) return
      const fields = frontMatter(codePoints(text, SKILL_FILE_CHARS))
      const name = fields.name || folder
      if (!seen.has(name) && !skip.has(name) && !META_SKILLS.includes(name) && fields.description) {
        seen.set(name, { name, description: fields.description, path: `${root}/${folder}/SKILL.md` })
      }
    })
  }
  return [...seen.values()]
}

// ── the local gate ───────────────────────────────────────────────────────────

// Turns that cannot be asking for a specialised procedure ("ok", "thanks, that worked"):
// answered here, for free, because asking costs a round trip on the turns a person notices
// latency most. A word belongs here only if it is a whole acknowledgement by itself and cannot
// start an instruction or be the thing one acts on; skillpick.py says why each one is or is not.
const ACK_WORDS = new Set(`
yes yeah yep yup no nope nah ok okay k sure certainly definitely absolutely
thanks ta cheers cool nice great perfect lovely brilliant awesome excellent
gotcha understood right correct exactly agreed fine good indeed alright
please nvm hi hey hello yo hiya morning afternoon evening night
bye later cya lol haha hah hmm hm huh oh ah sorry np
works worked working ready done thats its
and but so well then too also
stop wait
`.split(/\s+/).filter(Boolean))

// Acknowledgements whose words mean something else apart: only the whole phrase, in order.
const ACK_PHRASES = new Set([
  'go ahead', 'please do',
  'got it', 'thank you', 'thanks again', 'never mind', 'no worries', 'no problem', 'no prob',
  'of course', 'all done', 'all set', 'all good', 'all right', 'my bad', 'hold on',
  'that worked', 'that works', 'it worked', 'it works', 'whats up',
  'how are you', 'how are you doing', 'how are you today', 'how are you doing today',
  'hows it going', 'how is it going', 'how are things', 'hows things',
  'good morning', 'good night', 'nice work', 'well done',
])
const CONTINUATION_PHRASES = new Set(['next', 'and next', 'cool next', 'ok next', 'next one', 'go next', 'whats next'])
const LONGEST_PHRASE = Math.max(...[...ACK_PHRASES, ...CONTINUATION_PHRASES].map(p => p.split(' ').length))
const MAX_TRIVIAL_WORDS = 6
const QUESTION_MARKS = /[?？؟¿]/g // ASCII, full-width, Arabic, inverted
const APOSTROPHES = /['’ʼ]/g
// Python's [\W_]+: anything that is not a letter or a digit in any script.
const NOT_WORD = /[^\p{L}\p{N}]+/u
const ALNUM = /[\p{L}\p{N}]/u

const words = (text: string) => text.toLowerCase().replace(APOSTROPHES, '').split(NOT_WORD).filter(Boolean)

/**
 * True when no catalog could help: the turn is made of acknowledgements and nothing else.
 * Whatever this vocabulary cannot read is asked, because a wrong ask costs a fraction of a
 * cent and a wrong skip is a feature that quietly does nothing.
 */
export function looksTrivial(turn: string): boolean {
  const text = strip(turn ?? '')
  if (!text) return true
  // "all working?" is made of acknowledgement words and is still a question.
  if (/[?？؟¿]/.test(text) && !CONTINUATION_PHRASES.has(words(text.replace(QUESTION_MARKS, '')).join(' '))) return false
  // Nothing to read: no letter or digit in any script (punctuation, symbols, emoji).
  if (!ALNUM.test(text)) return true
  const found = words(text)
  // No words left means the split lost something readable, never that the turn is trivial.
  if (!found.length || found.length > MAX_TRIVIAL_WORDS) return false
  if (CONTINUATION_PHRASES.has(found.join(' '))) return true
  let position = 0
  outer: while (position < found.length) {
    for (let size = Math.min(LONGEST_PHRASE, found.length - position); size > 1; size--) {
      if (ACK_PHRASES.has(found.slice(position, position + size).join(' '))) {
        position += size
        continue outer
      }
    }
    if (!ACK_WORDS.has(found[position]!)) return false
    position += 1
  }
  return true
}

// ── ranking ──────────────────────────────────────────────────────────────────

export type Picked = { name: string; path: string; match: number }
export type PickResult = {
  status: 'ok' | 'fail_open'
  needs_skill?: number
  skills: Picked[]
  latency_ms?: number
  skipped?: 'trivial'
  reason?: string
  skills_dropped?: number
  /** Every request the pick made, for the caller's tally; not part of skillpick's reply. */
  calls?: Asked[]
  /** The error code of each request that failed. */
  errors?: string[]
}

export type PickOptions = {
  topK?: number
  needThreshold?: number
  matchThreshold?: number
  timeoutMs?: number
  /** The active backend, when the caller already looked it up; undefined looks it up. */
  backend?: Backend | null
}

const PICK_INSTRUCTION = 'Which skill is the specialised procedure this turn calls for?'
const pickName = (start: number) => `pick:${start}`

function options(catalog: Skill[], start: number): Record<string, string> {
  const out: Record<string, string> = {}
  catalog.slice(start, start + BATCH).forEach((skill, i) => {
    out[`S${start + i}`] = `${skill.name}: ${codePoints(skill.description, DESCRIPTION_CHARS)}`
  })
  out.none = 'No listed skill is a specialised procedure for this turn'
  return out
}

const codeOf = (error: unknown) => (error instanceof JevError ? error.code : 'network')

/** Which skill, if any, this turn needs, as skillpick.pick answers it. */
export async function pick(host: Host, turn: string, skills: Skill[], opts: PickOptions = {}): Promise<PickResult> {
  const offered = skills.filter(skill => !META_SKILLS.includes(skill.name))
  if (looksTrivial(turn)) return { status: 'ok', needs_skill: 0.0, skills: [], latency_ms: 0, skipped: 'trivial' }
  if (!offered.length || isSensitive(turn)) {
    return { status: 'fail_open', reason: !offered.length ? 'no skills' : 'turn looks sensitive; not sent', skills: [] }
  }
  let backend = opts.backend
  if (backend === undefined) {
    try { backend = await activeBackend(host) } catch { backend = null }
  }
  const catalog = offered.slice(0, MAX_SKILLS)
  const dropped = offered.length - catalog.length
  const reply = await rank(host, redact(turn, 2000), catalog, {
    topK: opts.topK ?? 3,
    needThreshold: opts.needThreshold ?? tuned(backend, 'skillpick.need_threshold'),
    matchThreshold: opts.matchThreshold ?? tuned(backend, 'skillpick.match_threshold'),
    floor: tuned(backend, 'skillpick.shortlist_floor'),
    timeoutMs: opts.timeoutMs ?? 5000,
    backend: backend ?? undefined,
  })
  // "No skill fits" is not a clean answer when some skills were never looked at.
  if (dropped) reply.skills_dropped = dropped
  return reply
}

type RankOptions = { topK: number; needThreshold: number; matchThreshold: number; floor: number; timeoutMs: number; backend?: Backend }

async function rank(host: Host, turnText: string, catalog: Skill[], opts: RankOptions): Promise<PickResult> {
  const calls: Asked[] = []
  const errors: string[] = []
  const asking = (state: unknown, questions: Record<string, unknown>) =>
    ask(host, state, questions, { timeoutMs: opts.timeoutMs, backend: opts.backend }).then(
      asked => { calls.push(asked); return asked },
      error => { errors.push(codeOf(error)); throw error })

  // Stage 1: each batch one choice over its skills plus "none", all batches side by side.
  const starts: number[] = []
  for (let start = 0; start < catalog.length; start += BATCH) starts.push(start)
  let replies: Asked[]
  try {
    replies = await Promise.all(starts.map(start =>
      asking({ turn: turnText }, { [pickName(start)]: choice(PICK_INSTRUCTION, options(catalog, start)) })))
  } catch (error) {
    // One lost batch fails the whole pick: ranking the batches that answered would say "no
    // skill" with confidence whenever the right one sat in the lost batch.
    return { status: 'fail_open', reason: `Jev unavailable (${codeOf(error)})`, skills: [], calls, errors }
  }
  const latency = Math.max(...replies.map(reply => reply.latency_ms))
  const ranked: [number, number][] = []
  replies.forEach((reply, n) => {
    const answer = reply.answers[pickName(starts[n]!)] as { probabilities: Record<string, number> }
    for (const [option, probability] of Object.entries(answer.probabilities)) {
      if (option !== 'none') ranked.push([probability, Number(option.slice(1))])
    }
  })
  // Python sorts the (probability, index) pairs in reverse: a tie goes to the later skill.
  ranked.sort((a, b) => b[0] - a[0] || b[1] - a[1])
  const finalists = ranked.slice(0, FINALISTS).filter(([p]) => p >= opts.floor).map(([, i]) => i)
  if (!finalists.length) return { status: 'ok', needs_skill: 0.0, skills: [], latency_ms: latency, calls, errors }

  // Stage 2: the finalists read properly, each judged on its own, "none of them" allowed.
  const listed: Record<string, string> = {}
  for (const i of finalists) listed[`S${i}`] = `${catalog[i]!.name}: ${codePoints(catalog[i]!.description, STAGE_TWO_CHARS)}`
  const questions: Record<string, unknown> = {
    needs_skill: noul('Doing this turn well requires the specialised instructions of one of these skills') }
  for (const i of finalists) questions[`s${i}`] = noul(`Skill S${i} is the right specialised procedure for this turn`)
  let reply: Asked
  try {
    reply = await asking({ turn: turnText, skills: listed }, questions)
  } catch (error) {
    return { status: 'fail_open', reason: `Jev unavailable (${codeOf(error)})`, skills: [], calls, errors }
  }
  const nouls = reply.answers as Record<string, { noul: number }>
  const need = nouls.needs_skill!.noul
  const verified = finalists.map(i => [nouls[`s${i}`]!.noul, i] as [number, number]).sort((a, b) => b[0] - a[0] || b[1] - a[1])
  const chosen = need < opts.needThreshold ? [] : verified.slice(0, opts.topK).filter(([p]) => p >= opts.matchThreshold)
    .map(([p, i]) => ({ name: catalog[i]!.name, path: catalog[i]!.path, match: pyRound(p, 3) }))
  return { status: 'ok', needs_skill: pyRound(need, 3), skills: chosen, latency_ms: latency + reply.latency_ms, calls, errors }
}
