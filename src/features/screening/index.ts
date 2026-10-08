import { hostOf } from '../../core/host'
import type { IO } from '../../core/io'
import { coolingOff, record } from '../../core/jev'
import * as memory from '../../core/memory'
import { costOf } from '../../engine/client'
import { configDir } from '../../engine/keys'
import { screenResult, withholdText } from '../../engine/screen'
import { kindOf, screenValue, SCREEN_MAX_TEXTS, SCREEN_MIN_CHARS, type Kind } from './targets'

// Screening: text that carries instructions aimed at an AI is withheld before the model reads
// it. WebFetch, WebSearch, every MCP tool, and Bash commands that fetch from the network.
// Only the offending sentences are replaced; the rest of the result is kept as it came.

export type ScreeningSpace = { withheld?: number }

export { kindOf }

/**
 * The jev switch for this hook: "off", "shadow" (judge and count, change nothing) or "on". Read
 * from the same files jev-skills' `jev switches hook_screen` writes, so an existing setting
 * holds: <config>/state.json, and a HOOK_SCREEN_OFF file beside it that turns it off whatever
 * the setting says. Unknown or unreadable reads as off.
 */
async function mode(io: IO, dir: string): Promise<string> {
  const host = hostOf(io)
  if (await host.readFile(`${dir}/HOOK_SCREEN_OFF`) !== undefined) return 'off'
  try {
    const value = String(JSON.parse((await host.readFile(`${dir}/state.json`)) ?? '{}').hook_screen ?? 'off').toLowerCase()
    return ['off', 'shadow', 'on'].includes(value) ? value : 'off'
  } catch {
    return 'off'
  }
}

/** A profile listed in routing.json's private_profiles sends nothing; so does one we cannot read. */
async function isPrivate(io: IO, dir: string): Promise<boolean> {
  const text = await hostOf(io).readFile(`${dir}/routing.json`)
  if (text === undefined) return false
  try {
    const list = JSON.parse(text).private_profiles
    return Array.isArray(list) && list.includes('default')
  } catch {
    return true
  }
}

/**
 * The text with the parts that carry instructions withheld, or null to leave it as it came.
 * Every unit is screened locally; the decision backend judges the rest unless the profile is
 * private or a recent failure has it cooling off, in which case the local verdict stands
 * alone rather than nothing being screened at all.
 */
async function screenText(io: IO, tool: string, text: string, raw: boolean) {
  if (text.length < SCREEN_MIN_CHARS) return null
  const host = hostOf(io)
  const dir = (await host.env('JEV_HOME')) || await configDir(host)
  const setting = await mode(io, dir)
  if (setting === 'off') return null
  const send = !coolingOff() && !(await isPrivate(io, dir))
  const verdict = await screenResult(host, tool, text, { send, raw })
  const calls = verdict.calls ?? []
  const failure = verdict.errors?.find(code => ['network', 'timeout', 'http_502', 'http_503', 'http_504'].includes(code)) ?? null
  if (calls.length || failure) {
    await record(io, { calls: calls.length + (verdict.errors?.length ?? 0), cost: calls.reduce((sum, c) => sum + costOf(c), 0),
      error: failure, model: calls.find(c => c.jev_model)?.jev_model })
  }
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
