import * as activity from '../../core/activity'
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
// profiles, localOnly, a subagent's output and a backend cooling off get the folding alone.
//
// Subagents: their goal is their own task prompt, which this hook does not see; judged against
// the person's latest request, a subagent could lose what its own task needs. Folding asks no
// one and loses nothing a marker does not point back to, so subagents get that and no more.

export type TrimSpace = { trimmed?: number; charsSaved?: number }

const ID = 'trim-output'
/** All the decision model may add to a command's wait, across every request for one output. */
export const BUDGET_MS = 4_000
/** Larger outputs pass as they came: a ring of KEEP_FILES archives stays a few tens of MB at most. */
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

type Source = { text: string; put: (text: string) => unknown }

/**
 * The text the model would read, and how to put a shorter one in its place, as Bash's record. A
 * failed command comes as one string ("Exit code N" and the output); a large one comes cut at
 * 30,000 characters with the whole of it in Claude Code's own file, which is read instead.
 */
async function sourceOf(io: IO, result: any): Promise<Source | null> {
  // A failed command's result is one string; the hook must answer Bash's record, and the
  // output's first line ("Exit code N") is kept, so the model still reads how it ended.
  if (typeof result === 'string') {
    return { text: result, put: text => ({ stdout: text, stderr: '', interrupted: false, isImage: false }) }
  }
  if (!result || typeof result !== 'object' || typeof result.stdout !== 'string') return null
  if (result.isImage || result.backgroundTaskId || result.interrupted) return null
  let text: string = result.stdout
  const persisted = typeof result.persistedOutputPath === 'string' ? result.persistedOutputPath : null
  if (persisted) {
    try { text = await io.readFile(persisted) } catch { return null }
  }
  return {
    text,
    put: out => {
      if (persisted && out.length > INLINE_CHARS) return null
      const { persistedOutputPath: _p, persistedOutputSize: _s, ...rest } = result
      return { ...rest, stdout: out }
    },
  }
}

/** Where the full outputs are kept: a ring of KEEP_FILES files under the user's cache folder. */
async function archive(io: IO, text: string): Promise<string | null> {
  const home = await io.home()
  const cache = (await io.env('XDG_CACHE_HOME')) || (home ? `${home}/.cache` : '')
  if (!cache) return null
  const stored = await io.storeGet(ID).catch(() => undefined) as { next?: unknown } | undefined
  const slot = Math.abs(Math.trunc(Number(stored?.next) || 0)) % KEEP_FILES
  await io.storeSet(ID, { next: (slot + 1) % KEEP_FILES })
  const path = `${cache}/jev-mod/outputs/${slot + 1}.txt`
  await io.writeFile(path, text)
  return path
}

/**
 * Step 2: the folded rows with the chunks the decision model judged unneeded replaced by
 * markers. Every request runs at once within BUDGET_MS; a failure keeps its chunks.
 */
async function judge(io: IO, rows: Row[], command: string, threshold: number, shadow: boolean): Promise<Row[]> {
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

/**
 * The Bash result with its output trimmed, or null to leave it exactly as it came: under
 * `minLines`, nothing to fold or drop, off, shadow, or anything failing on the way.
 */
export async function trim(io: IO, call: { command: string; subagent: boolean }, result: unknown): Promise<unknown | null> {
  try {
    const mine = await setting(io, ID)
    if (mine.mode === 'off') return null
    const minLines = Number(mine.knobs.minLines?.value ?? 200)
    const threshold = Number(mine.knobs.keepThreshold?.value ?? 0.35)
    const localOnly = mine.knobs.localOnly?.value === true
    const source = await sourceOf(io, result)
    if (!source || source.text.length > MAX_CHARS) return null
    const lines = linesOf(source.text)
    if (lines.length < minLines) return null
    let rows = fold(lines)
    const send = !localOnly && !call.subagent && rows.length > minLines && !coolingOff()
      && !(await isPrivate(io, await jevDir(io)))
    if (send) rows = await judge(io, rows, call.command, threshold, mine.mode !== 'on')
    if (!changed(rows)) {
      void activity.count(io, ID, 'kept')
      return null
    }
    if (mine.mode !== 'on') {
      const out = render(rows, lines.length, '<path>')
      void activity.count(io, ID, 'would-trim')
      void activity.count(io, ID, 'would-save-lines', lines.length - linesOf(out).length)
      void activity.count(io, ID, 'would-save-chars', Math.max(0, source.text.length - out.length))
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
