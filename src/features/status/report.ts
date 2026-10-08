// /jev-status: what the mod is connected to and whether it answers. Pure: the facts in, the
// lines out. Nothing here ever holds a key; the facts say only where one was found.

import type { KeySource } from '../../engine/keys'

export type Facts = {
  version: string
  /** A named backend from backends.json, or a built-in provider. */
  backend: { name: string; model: string; url: string } | null
  provider: string // typesafe | openrouter | venice | zen | absent
  keySource: KeySource
  gateway: string | null // TYPESAFE_BASE_URL when it points elsewhere
  misconfigured: string | null // why backends.json could not be read
  check: { ok: true; model: string | null; ms: number; cost: number } | { ok: false; error: string; said: string } | null
  switches: { routing: boolean; skills: string; screening: string; private: boolean }
  budget: { spent: number; daily: number } | null
}

const SOURCE: Record<KeySource, string> = {
  environment: 'from the environment', settings: "from this mod's settings (Claude Code's credential store)",
  keychain: "from the OS secret store (jev-skills' setup-key)", file: "from ~/.config/jev (jev-skills' setup-key)",
  none: 'none found',
}

const NAMES: Record<string, string> = { typesafe: 'TypeSafe', openrouter: 'OpenRouter', venice: 'Venice', zen: 'OpenCode Zen' }

/** What to do about a failed check, by its code. */
function advice(error: string, facts: Facts): string {
  if (error === 'no_key') return "Set a key in jev-mod's settings: /plugin, or `claude plugin configure jev-mod@jev-mod --values-stdin` in your own terminal (README)."
  if (error === 'auth_failed') return facts.backend ? "The server refused the key: set the named backend key in jev-mod's settings."
    : `${NAMES[facts.provider] ?? 'The provider'} refused the key: replace it in jev-mod's settings.`
  if (error === 'credits_exhausted') return 'The account is out of credit.'
  if (error === 'backend_misconfigured') return 'Fix ~/.config/jev/backends.json (see below).'
  if (['network', 'timeout', 'http_502', 'http_503', 'http_504', 'overloaded', 'rate_limited'].includes(error)) return 'The backend did not answer; every feature fails open meanwhile.'
  return 'Every feature fails open meanwhile: Claude Code runs as if the mod were not there.'
}

export function report(f: Facts): string {
  const lines = [`jev-mod ${f.version}`]
  if (f.misconfigured) lines.push(`backends.json: ${f.misconfigured}`)
  if (f.backend) lines.push(`backend: ${f.backend.name} · ${f.backend.model} at ${f.backend.url}`)
  else if (f.provider === 'absent') lines.push('backend: none (no key found for TypeSafe, OpenRouter, Venice or OpenCode Zen)')
  else lines.push(`backend: Jev through ${NAMES[f.provider] ?? f.provider}${f.gateway ? ` (gateway ${f.gateway})` : ''}`)
  lines.push(`key: ${SOURCE[f.keySource]}`)
  if (f.check === null) lines.push('check: not run')
  else if (f.check.ok) lines.push(`check: ok, answered by ${f.check.model ?? 'an unnamed model'} in ${f.check.ms} ms ($${f.check.cost.toFixed(5)})`)
  else lines.push(`check: failed (${f.check.error})${f.check.said ? `: ${f.check.said}` : ''}. ${advice(f.check.error, f)}`)
  const s = f.switches
  lines.push(`switches: routing ${s.routing ? 'on' : 'off'} · skills ${s.skills} · screening ${s.screening}${s.private ? ' · private (nothing is sent)' : ''}`)
  if (f.budget) lines.push(`today: $${f.budget.spent.toFixed(4)} of the $${f.budget.daily.toFixed(2)} daily budget`)
  return lines.join('\n')
}

/** Any text that will be shown, with every known key replaced: belt and braces over a server's echo. */
export function scrub(text: string, keys: (string | undefined)[]): string {
  let out = text
  for (const key of keys) if (key && key.length >= 8) out = out.split(key).join('[key]')
  return out
}
