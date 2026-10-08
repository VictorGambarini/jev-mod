import * as activity from '../../core/activity'
import { inBackground } from '../../core/background'
import { setting } from '../../core/config'
import { hostOf } from '../../core/host'
import type { IO } from '../../core/io'
import { coolingOff, recordCalls } from '../../core/jev'
import { limitsOf } from '../../core/limits'
import * as memory from '../../core/memory'
import { isPrivate, jevDir } from '../../core/settings'
import { ask, costOf, JevError, type Asked } from '../../engine/client'
import { isSensitive } from '../../engine/privacy'
import {
  changed, chunk, chunkText, drop, fold, linesOf, MAX_SENT_CHUNKS, pack, render, request, type Row,
} from './trim'

// Output trimming: a long Bash output is cut down to what the current goal needs before the
// model reads it, and the full output is kept in a file the model can read for more.
//
// Repeats are folded locally (trim.ts), always. What is still long is cut into chunks, and the
// decision model says which the goal still needs; the rest become markers naming their lines
// in the archived output. A chunk with an error, a failure, a stack frame or a summary is never
// sent and never dropped, and neither is one that looks like it holds a secret. Private
// profiles, localOnly, a subagent's output, a backend cooling off, and a goal or command that
// looks like it holds a secret get the folding alone. In shadow the judgement runs in the
// background, so it adds nothing to the command's wait.
//
// Subagents: their goal is their own task prompt, which this hook does not see; judged against
// the person's latest request, a subagent could lose what its own task needs. Folding asks no
// one and loses nothing a marker does not point back to, so subagents get that and no more.

export type TrimSpace = { trimmed?: number; charsSaved?: number }

const ID = 'trim-output'
/** All the decision model may add to a command's wait, across every request for one output. */
export const BUDGET_MS = 4_000
/** Larger outputs pass as they came: the KEEP_FILES archives kept stay a few tens of MB at most. */
export const MAX_CHARS = 1_000_000
export const KEEP_FILES = 50
/** Claude Code shows a persisted output as a 2KB preview above this; a trim that does not fit gains nothing. */
const INLINE_CHARS = 30_000

/** The person's latest request: what "the current goal" means to the decision model. */
let goal = ''

/** A turn began with this prompt; an empty one (a continuation) keeps the goal it had. */
export function noteGoal(text: string): void {
  if (text.trim()) goal = text
}

/** Whether a tool's results are trimmed at all: Bash only. */
export function wants(tool: string): boolean {
  return tool === 'Bash'
}

/** What the hook knows of the call; `screen` only for a command screening looks at (see sourceOf). */
export type Call = {
  command: string
  subagent: boolean
  /** The whole of a persisted output through screening's screen: the text to use, or null when it could not be screened. */
  screen?: (text: string) => Promise<string | null>
}

type Source = { text: string; put: (text: string) => unknown }

/**
 * The text the model would read, and how to put a shorter one in its place. A failed command
 * comes as its error text ("Exit code N" and the output), and a shorter error text goes back.
 * A large output comes cut at 30,000 characters with the whole of it in Claude Code's own file,
 * which is read instead; when screening looks at the command, that file's text is screened
 * before anything of it is used (its preview was, the file was not), and kept out when it
 * cannot be.
 */
async function sourceOf(io: IO, result: unknown, screen?: Call['screen']): Promise<Source | null> {
  if (typeof result === 'string') return { text: result, put: text => text }
  const record = result as Record<string, unknown> | null
  if (!record || typeof record !== 'object' || typeof record.stdout !== 'string') return null
  if (record.isImage || record.backgroundTaskId || record.interrupted) return null
  let text: string = record.stdout
  const persisted = typeof record.persistedOutputPath === 'string' ? record.persistedOutputPath : null
  if (persisted) {
    try { text = await io.readFile(persisted) } catch { return null }
    if (text.length > MAX_CHARS) return null
    if (screen) {
      const screened = await screen(text)
      if (screened === null) return null
      text = screened
    }
  }
  return {
    text,
    put: out => {
      if (persisted && out.length > INLINE_CHARS) return null
      const { persistedOutputPath: _p, persistedOutputSize: _s, ...rest } = record
      return { ...rest, stdout: out }
    },
  }
}

// What archive() names its files, and the ring's numbered files from before (pruned the same way).
const ARCHIVE_NAME = /^(?:\d+-[0-9a-f]{8,32}|\d{1,2})\.txt$/

function randomId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  } catch {
    return Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')).join('')
  }
}

/**
 * Where a full output is kept: a file of its own under the user's cache folder, named by the
 * time and a random id, so two outputs at once never share one. The folder is pruned to the
 * newest KEEP_FILES afterwards, in the background.
 */
async function archive(io: IO, text: string): Promise<string | null> {
  const home = await io.home()
  const cache = (await io.env('XDG_CACHE_HOME')) || (home ? `${home}/.cache` : '')
  if (!cache) return null
  const dir = `${cache}/jev-mod/outputs`
  const path = `${dir}/${Date.now()}-${randomId()}.txt`
  await io.writeFile(path, text)
  inBackground(() => prune(io, dir))
  return path
}

/** The folder's archives past the newest KEEP_FILES, removed; nothing else in it is touched. */
async function prune(io: IO, dir: string): Promise<void> {
  const ours = (await io.files(dir)).filter(f => ARCHIVE_NAME.test(f.name))
  if (ours.length <= KEEP_FILES) return
  const old = ours.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name)).slice(KEEP_FILES)
  await io.run(['rm', '-f', '--', ...old.map(f => `${dir}/${f.name}`)], { timeoutMs: 5000 })
}

/**
 * Step 2: the folded rows with the chunks the decision model judged unneeded replaced by
 * markers. Every request runs at once within BUDGET_MS; a failure keeps its chunks.
 */
async function judge(io: IO, rows: Row[], goal: string, command: string, threshold: number, shadow: boolean): Promise<Row[]> {
  const chunks = chunk(rows)
  const texts = new Map<number, string>()
  chunks.forEach((c, id) => {
    if (c.keep || texts.size >= MAX_SENT_CHUNKS) return
    if (isSensitive(rows.slice(c.start, c.end + 1).map(r => r.text).join('\n'))) return
    texts.set(id, chunkText(rows, c))
  })
  if (!texts.size) return rows
  const host = hostOf(io)
  const limits = await limitsOf(io)
  const deadline = Date.now() + BUDGET_MS
  const calls: Asked[] = []
  const errors: string[] = []
  const need = new Map<number, number>()
  await Promise.all(pack(texts).map(async ids => {
    if (limits) {
      const [allowed] = await limits.admit(shadow)
      if (!allowed) return
    }
    const { state, questions } = request(goal, command, texts, ids)
    try {
      const reply = await ask(host, state, questions, { timeoutMs: Math.max(0, deadline - Date.now()), retries: 0 })
      calls.push(reply)
      if (limits) await limits.charge(costOf(reply))
      for (const id of ids) {
        const answer = reply.answers[`c${id}`]
        if (answer?.type === 'noul') need.set(id, answer.noul)
      }
    } catch (error) {
      if (!(error instanceof JevError)) throw error
      errors.push(error.code)
    }
  }))
  await recordCalls(io, calls, errors, ID)
  return need.size ? drop(rows, chunks, need, threshold) : rows
}

/** Shadow's count: what the rows would have saved, or that they changed nothing. */
function countShadow(io: IO, text: string, lines: string[], rows: Row[]): void {
  if (!changed(rows)) {
    void activity.count(io, ID, 'kept')
    return
  }
  const out = render(rows, lines.length, '<path>')
  void activity.count(io, ID, 'would-trim')
  void activity.count(io, ID, 'would-save-lines', lines.length - linesOf(out).length)
  void activity.count(io, ID, 'would-save-chars', Math.max(0, text.length - out.length))
}

/**
 * The Bash result with its output trimmed, or null to leave it exactly as it came: under
 * `minLines`, nothing to fold or drop, off, shadow, or anything failing on the way. In shadow
 * the decision model's judgement runs in the background and is only counted: it never holds
 * the command up.
 */
export async function trim(io: IO, call: Call, result: unknown): Promise<unknown | null> {
  try {
    const mine = await setting(io, ID)
    if (mine.mode === 'off') return null
    const shadow = mine.mode !== 'on'
    const minLines = Number(mine.knobs.minLines?.value ?? 200)
    const threshold = Number(mine.knobs.keepThreshold?.value ?? 0.35)
    const localOnly = mine.knobs.localOnly?.value === true
    // only what is put in front of the model needs screening; shadow puts nothing there
    const source = await sourceOf(io, result, shadow ? undefined : call.screen)
    if (!source || source.text.length > MAX_CHARS) return null
    const lines = linesOf(source.text)
    if (lines.length < minLines) return null
    const folded = fold(lines)
    // the goal and the command go out redacted; one that looks like it holds a secret is not sent at all
    const goalNow = goal
    const send = !localOnly && !call.subagent && folded.length > minLines && !coolingOff()
      && !isSensitive(goalNow) && !isSensitive(call.command)
      && !(await isPrivate(io, await jevDir(io)))
    if (shadow) {
      if (!send) countShadow(io, source.text, lines, folded)
      else inBackground(async () => countShadow(io, source.text, lines, await judge(io, folded, goalNow, call.command, threshold, true)))
      return null
    }
    const rows = send ? await judge(io, folded, goalNow, call.command, threshold, false) : folded
    if (!changed(rows)) {
      void activity.count(io, ID, 'kept')
      return null
    }
    const path = await archive(io, source.text)
    if (!path) return null
    const out = render(rows, lines.length, path)
    if (out.length >= source.text.length) return null
    const replaced = source.put(out)
    if (replaced === null) return null
    const space = memory.space<TrimSpace>(ID)
    space.trimmed = (space.trimmed ?? 0) + 1
    space.charsSaved = (space.charsSaved ?? 0) + source.text.length - out.length
    void memory.save(io)
    void activity.count(io, ID, 'trimmed')
    void activity.count(io, ID, 'lines-saved', lines.length - linesOf(out).length)
    void activity.count(io, ID, 'chars-saved', source.text.length - out.length)
    return replaced
  } catch {
    return null
  }
}
