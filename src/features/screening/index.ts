import { hostOf } from '../../core/host'
import * as activity from '../../core/activity'
import type { IO } from '../../core/io'
import { coolingOff, recordCalls } from '../../core/jev'
import * as memory from '../../core/memory'
import { modeOf } from '../../core/config'
import { isPrivate, jevDir } from '../../core/settings'
import { screenResult, withholdText } from '../../engine/screen'
import { kindOf, screenValue, SCREEN_MAX_TEXTS, SCREEN_MIN_CHARS, type Kind } from './targets'

// Screening: text that carries instructions aimed at an AI is withheld before the model reads
// it. WebFetch, WebSearch, every MCP tool, and Bash commands that fetch from the network.
// Only the offending sentences are replaced; the rest of the result is kept as it came.

export type ScreeningSpace = { withheld?: number }

export { kindOf }

/**
 * The text with the parts that carry instructions withheld, or null to leave it as it came.
 * Every unit is screened locally; the decision backend judges the rest unless the profile is
 * private or a recent failure has it cooling off, in which case the local verdict stands
 * alone rather than nothing being screened at all.
 */
async function screenText(io: IO, tool: string, text: string, raw: boolean) {
  if (text.length < SCREEN_MIN_CHARS) return null
  const setting = await modeOf(io, 'screening')
  if (setting === 'off') return null
  const { verdict } = await judge(io, tool, text, raw)
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
async function judge(io: IO, tool: string, text: string, raw: boolean) {
  const send = !coolingOff() && !(await isPrivate(io, await jevDir(io)))
  const verdict = await screenResult(hostOf(io), tool, text, { send, raw })
  await recordCalls(io, verdict.calls ?? [], verdict.errors ?? [], 'screening')
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
    if (setting === 'off' || text.length < SCREEN_MIN_CHARS) return text
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
    const budget = { left: SCREEN_MAX_TEXTS, withheld: 0 }
    const results = []
    for (const item of result.results) {
      results.push(typeof item === 'string' ? await screenValue(item, t => screenText(io, 'WebSearch', t, false), budget) : item)
    }
    if (!budget.withheld) return null
    count(io, budget.withheld, 'search results')
    return { ...result, results }
  }
  if (kind === 'bash') {
    const stdout = result?.stdout
    if (typeof stdout !== 'string' || stdout.length < SCREEN_MIN_CHARS) return null
    const out = await screenText(io, 'Bash', stdout, true)
    if (!out) return null
    count(io, out.flagged, 'a fetched response')
    return { ...result, stdout: out.text }
  }
  const budget = { left: SCREEN_MAX_TEXTS, withheld: 0 }
  const screened = await screenValue(result, t => screenText(io, tool, t, true), budget)
  if (!budget.withheld) return null
  count(io, budget.withheld, tool.replace(/^mcp__/, ''))
  return screened
}
