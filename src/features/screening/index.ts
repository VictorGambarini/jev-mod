import { hostOf } from '../../core/host'
import * as activity from '../../core/activity'
import type { IO } from '../../core/io'
import { coolingOff, recordCalls } from '../../core/jev'
import { limitsOf } from '../../core/limits'
import * as memory from '../../core/memory'
import { modeOf } from '../../core/config'
import { isPrivate, jevDir } from '../../core/settings'
import { costOf } from '../../engine/client'
import { screenResult, withholdText } from '../../engine/screen'
import { kindOf, screenValue, SCREEN_MAX_TEXTS, SCREEN_MIN_CHARS, type Kind } from './targets'

// Screening: text that carries instructions aimed at an AI is withheld before the model reads
// it. WebFetch, WebSearch, MCP tool results, and Bash commands that fetch from the network or
// print other people's text (stdout and stderr, failed or not). Every text gets the local
// screen at any length; the decision backend also judges texts of SCREEN_MIN_CHARS or more
// (the first SCREEN_MAX_TEXTS of a result). Where only the local screen recognises the
// sentence, only the sentence is replaced; a passage the backend alone flags goes whole.

export type ScreeningSpace = { withheld?: number }

export { kindOf }

/**
 * The text with the parts that carry instructions withheld, or null to leave it as it came.
 * Every unit is screened locally; the decision backend judges the rest unless the profile is
 * private, a recent failure has it cooling off or the daily budget is spent, in which case the
 * local verdict stands alone rather than nothing being screened at all.
 */
async function screenText(io: IO, tool: string, text: string, raw: boolean, localOnly = false) {
  const setting = await modeOf(io, 'screening')
  if (setting === 'off') return null
  const { verdict } = await judge(io, tool, text, raw, localOnly)
  const withheld = withholdText(tool, text, raw, verdict)
  if (withheld === null) return null
  // shadow: what it would have withheld is counted, and the text goes on as it came
  if (setting !== 'on') {
    await activity.count(io, 'screening', 'would-withhold', verdict.flagged.length)
    return null
  }
  return { text: withheld, flagged: verdict.flagged.length }
}

/** The screen's verdict on one text, and whether the backend was to be asked. */
async function judge(io: IO, tool: string, text: string, raw: boolean, localOnly = false) {
  let send = !localOnly && text.length >= SCREEN_MIN_CHARS && !coolingOff() && !(await isPrivate(io, await jevDir(io)))
  // One screen against the daily budget, as live work (it guards what the model reads): past
  // the budget it is screened locally, never left unscreened.
  const limits = send ? await limitsOf(io) : undefined
  if (limits) send = (await limits.admit(false))[0]
  const verdict = await screenResult(hostOf(io), tool, text, { send, raw })
  const calls = verdict.calls ?? []
  await Promise.all([recordCalls(io, calls, verdict.errors ?? [], 'screening'),
    limits?.charge(calls.reduce((sum, c) => sum + costOf(c), 0))])
  return { verdict, send }
}

/**
 * A fetching Bash command's whole output, read from the file Claude Code kept it in, through the
 * same screen as its preview: what trim-output reads there must not reach the model unscreened.
 * The text to use (withheld in on; as it came, counted, in shadow; as it came when screening is
 * off), or null when it could not be screened (the screen failed, or the backend it was to ask
 * did not answer): then the file's text must not be put in front of the model.
 */
export async function screenWhole(io: IO, text: string): Promise<string | null> {
  try {
    const setting = await modeOf(io, 'screening')
    if (setting === 'off') return text
    const { verdict, send } = await judge(io, 'Bash', text, true)
    if (verdict.screening === 'none' && verdict.status === 'fail_open') return null
    if (send && verdict.errors?.length) return null
    const withheld = withholdText('Bash', text, true, verdict)
    if (withheld === null) return text
    if (setting !== 'on') {
      await activity.count(io, 'screening', 'would-withhold', verdict.flagged.length)
      return text
    }
    count(io, verdict.flagged.length, 'a fetched response')
    return withheld
  } catch {
    return null
  }
}

function count(io: IO, withheld: number, what: string): void {
  const mine = memory.space<ScreeningSpace>('screening')
  mine.withheld = (mine.withheld ?? 0) + withheld
  io.toast(`jev-mod: withheld ${withheld} part(s) of ${what}`)
  void memory.save(io)
  void activity.count(io, 'screening', 'withheld', withheld)
}

const BEYOND = (n: number) =>
  `[jev-mod: the decision backend screened only the first ${SCREEN_MAX_TEXTS} texts of this result; ${n} more long text(s) were screened by the local patterns alone]`

/** The result with a line added saying what the backend did not cover. */
function noted(value: unknown, note: string): unknown {
  if (typeof value === 'string') return `${value}\n${note}`
  if (Array.isArray(value)) return [...value, note]
  const object = value as { content?: unknown }
  if (object && typeof object === 'object' && Array.isArray(object.content)) {
    return { ...object, content: [...object.content, { type: 'text', text: note }] }
  }
  return value
}

/** A result's texts through screenValue: the screened result, or null when nothing changed. */
async function screenMany(io: IO, tool: string, value: unknown, what: string, raw = true) {
  const budget = { left: SCREEN_MAX_TEXTS, withheld: 0, beyond: 0 }
  let screened = await screenValue(value, t => screenText(io, tool, t, raw),
    t => screenText(io, tool, t, raw, true), budget)
  if (!budget.withheld && !budget.beyond) return null
  if (budget.withheld) count(io, budget.withheld, what)
  if (budget.beyond) screened = noted(screened, BEYOND(budget.beyond))
  return screened
}

/** One Bash stream (stdout or stderr) of a fetching command, screened; null to leave it. */
async function screenStream(io: IO, text: unknown) {
  if (typeof text !== 'string' || !text) return null
  const out = await screenText(io, 'Bash', text, true)
  if (!out) return null
  count(io, out.flagged, 'a fetched response')
  return out.text
}

/**
 * A failed call's answer (isError) with injected text withheld, or null to leave it. A failing
 * curl can still print a hostile page, so its text (`text`, or a string `result`) is screened
 * as a success's is.
 */
export async function filterFailed(io: IO, kind: Kind, tool: string, ran: any): Promise<any | null> {
  const field = typeof ran?.text === 'string' ? 'text' : typeof ran?.result === 'string' ? 'result' : null
  if (!field) {
    const result = ran?.result === undefined || ran?.result === null ? null : await filter(io, kind, tool, ran.result)
    return result === null ? null : { ...ran, result }
  }
  const text: string = ran[field]
  const screened = kind === 'bash' ? await screenStream(io, text) : await screenMany(io, tool, text, tool.replace(/^mcp__/, ''))
  return screened === null ? null : { ...ran, [field]: screened }
}

/** The tool's result with injected text withheld, or null to leave it exactly as it was. */
export async function filter(io: IO, kind: Kind, tool: string, result: any): Promise<any | null> {
  if (kind === 'WebFetch') {
    if (typeof result?.result !== 'string') return null
    const out = await screenText(io, 'WebFetch', result.result, false)
    if (!out) return null
    count(io, out.flagged, 'a fetched page')
    return { ...result, result: out.text }
  }
  if (kind === 'WebSearch') {
    if (!Array.isArray(result?.results)) return null
    const results = await screenMany(io, 'WebSearch', result.results, 'search results', false)
    return results === null ? null : { ...result, results }
  }
  if (kind === 'bash') {
    if (typeof result === 'string') return screenStream(io, result)
    if (result === null || typeof result !== 'object') return null
    const stdout = await screenStream(io, result.stdout)
    const stderr = await screenStream(io, result.stderr)
    if (stdout === null && stderr === null) return null
    return { ...result, ...(stdout === null ? {} : { stdout }), ...(stderr === null ? {} : { stderr }) }
  }
  return screenMany(io, tool, result, tool.replace(/^mcp__/, ''))
}
