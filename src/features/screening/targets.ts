// Screening's rules: which tool results carry someone else's text, and how to walk a result
// to the texts inside it. Plain functions, so the test kit can hold them to their word.

import { SCREEN_MIN_CHARS } from '../../engine/screen'
import { commandsIn } from '../tool-gate/rules'

export { SCREEN_MIN_CHARS }
export const SCREEN_MAX_TEXTS = 8

// A command that starts (or pipes into, or runs in a subshell) a network fetcher: its output
// is a page or an API reply, screened like WebFetch's. Read on the command line as written ...
const NETWORK_COMMAND = /(^|[;&|(`]|\$\()\s*(sudo\s+)?(curl|wget|xh|https?|lynx|w3m|links|aria2c|gh\s+api)\b/

const FETCHERS = new Set(['curl', 'wget', 'xh', 'http', 'https', 'lynx', 'w3m', 'links', 'aria2c'])
// ... and as the commands it runs, behind env, timeout, xargs, sudo, `bash -c` and the like.
// gh prints other people's text with these: an issue, a pull request, a run's log, a release.
const GH_READS: Record<string, string[] | '*'> = {
  api: '*', search: '*',
  issue: ['view', 'list', 'status'], pr: ['view', 'list', 'diff', 'status', 'checks'],
  run: ['view'], release: ['view', 'list'], gist: ['view'], discussion: ['view', 'list'],
}

function fetches(words: readonly string[]): boolean {
  if (FETCHERS.has(words[0]!)) return true
  if (words[0] !== 'gh') return false
  const [group, action] = words.slice(1).filter(w => !w.startsWith('-'))
  const reads = group ? GH_READS[group] : undefined
  return reads === '*' || (reads !== undefined && action !== undefined && reads.includes(action))
}

export function isNetworkCommand(command: string): boolean {
  if (NETWORK_COMMAND.test(command)) return true
  try { return commandsIn(command).some(fetches) } catch { return false }
}

export type Kind = 'WebFetch' | 'WebSearch' | 'mcp' | 'bash'

/** What kind of screening a tool call gets, or null for none. */
export function kindOf(tool: string, input: Record<string, unknown>): Kind | null {
  if (tool === 'WebFetch' || tool === 'WebSearch') return tool
  if (tool.startsWith('mcp__')) return 'mcp'
  if (tool === 'Bash' && typeof input.command === 'string' && isNetworkCommand(input.command)) return 'bash'
  return null
}

export type Screen = (text: string) => Promise<{ text: string; flagged: number } | null>
/** `left`: texts the backend may still judge; `beyond`: long texts past that, screened locally only. */
export type Budget = { left: number; withheld: number; beyond: number }

/**
 * Every text a result carries, screened in place: a string, a list (each item), a content
 * block (`{ type: 'text', text }`) or `{ content: [...] }`. Anything else passes as it came.
 * A text is screened at any length; `screen` (the backend may judge it) takes the first
 * `budget.left` texts of SCREEN_MIN_CHARS or more, `local` (this machine only) the rest.
 */
export async function screenValue(value: unknown, screen: Screen, local: Screen, budget: Budget): Promise<unknown> {
  if (typeof value === 'string') {
    if (!value) return value
    let use = local
    if (value.length >= SCREEN_MIN_CHARS) {
      if (budget.left > 0) { budget.left -= 1; use = screen } else budget.beyond += 1
    }
    const out = await use(value)
    if (!out) return value
    budget.withheld += out.flagged
    return out.text
  }
  if (Array.isArray(value)) {
    const items = []
    for (const item of value) items.push(await screenValue(item, screen, local, budget))
    return items
  }
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    if (object.type === 'text' && typeof object.text === 'string') {
      return { ...object, text: await screenValue(object.text, screen, local, budget) }
    }
    if (Array.isArray(object.content)) return { ...object, content: await screenValue(object.content, screen, local, budget) }
  }
  return value
}
