// Screening's rules: which tool results carry someone else's text, and how to walk a result
// to the texts inside it. Plain functions, so the test kit can hold them to their word.

export const SCREEN_MIN_CHARS = 200
export const SCREEN_MAX_TEXTS = 8

// A command that starts (or pipes into, or runs in a subshell) a network fetcher: its output
// is a page or an API reply, screened like WebFetch's.
const NETWORK_COMMAND = /(^|[;&|(`]|\$\()\s*(sudo\s+)?(curl|wget|xh|https?|lynx|w3m|links|aria2c|gh\s+api)\b/

export function isNetworkCommand(command: string): boolean {
  return NETWORK_COMMAND.test(command)
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
export type Budget = { left: number; withheld: number }

/**
 * Every text a result carries, screened in place: a string, a list (each item), a content
 * block (`{ type: 'text', text }`) or `{ content: [...] }`. Anything else passes as it came.
 * Texts under SCREEN_MIN_CHARS are left alone; at most `budget.left` texts are screened.
 */
export async function screenValue(value: unknown, screen: Screen, budget: Budget): Promise<unknown> {
  if (budget.left <= 0) return value
  if (typeof value === 'string') {
    if (value.length < SCREEN_MIN_CHARS) return value
    budget.left -= 1
    const out = await screen(value)
    if (!out) return value
    budget.withheld += out.flagged
    return out.text
  }
  if (Array.isArray(value)) {
    const items = []
    for (const item of value) items.push(await screenValue(item, screen, budget))
    return items
  }
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    if (object.type === 'text' && typeof object.text === 'string') {
      return { ...object, text: await screenValue(object.text, screen, budget) }
    }
    if (Array.isArray(object.content)) return { ...object, content: await screenValue(object.content, screen, budget) }
  }
  return value
}
