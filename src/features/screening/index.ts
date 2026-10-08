import { hostOf } from '../../core/host'
import type { IO } from '../../core/io'
import { coolingOff, recordCalls } from '../../core/jev'
import * as memory from '../../core/memory'
import { isPrivate, jevDir, mode } from '../../core/settings'
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
  const host = hostOf(io)
  const dir = await jevDir(io)
  const setting = await mode(io, dir, 'hook_screen')
  if (setting === 'off') return null
  const send = !coolingOff() && !(await isPrivate(io, dir))
  const verdict = await screenResult(host, tool, text, { send, raw })
  await recordCalls(io, verdict.calls ?? [], verdict.errors ?? [])
  if (setting !== 'on') return null
  const withheld = withholdText(tool, text, raw, verdict)
  return withheld === null ? null : { text: withheld, flagged: verdict.flagged.length }
}

function count(io: IO, withheld: number, what: string): void {
  const mine = memory.space<ScreeningSpace>('screening')
  mine.withheld = (mine.withheld ?? 0) + withheld
  io.toast(`jev: withheld ${withheld} part(s) of ${what}`)
  void memory.save(io)
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
