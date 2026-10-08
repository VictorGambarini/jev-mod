// The jev-mod band above the prompt: what jev-mod decided this turn, its cost this session, what
// screening withheld, and which backend answers (red, with the reason, while it is failing).
// Pure: the session's record in, coloured segments out; register.tsx draws them.

export type Segment = { text: string; color?: 'yellow' | 'red' | 'green'; dim?: boolean }
export type Features = Record<string, Record<string, any>>

const DIFFICULTY: Record<string, string> = { small: 'easy', medium: 'normal', high: 'hard', escalate: 'critical' }

/** claude-haiku-4-5-20251001 -> haiku 4.5; anything else as it came, less "claude-". */
export function shortModel(model: string | undefined): string | undefined {
  if (!model) return undefined
  const name = model.replace(/^claude-/, '')
  const found = /^(haiku|sonnet|opus|fable)-(\d+)(?:-(\d+))?(?:-|$)/.exec(name)
  if (!found) return name
  return `${found[1]} ${found[3] && found[3].length < 3 ? `${found[2]}.${found[3]}` : found[2]}`
}

export function money(usd: number): string {
  return usd >= 1 ? `$${usd.toFixed(2)}` : usd >= 0.001 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(5)}`
}

/** "typesafe/jev-1.13-20260917" -> "jev-1.13 · typesafe"; a backend's own model id as it is. */
function backend(model: string | undefined): string {
  if (!model) return 'jev'
  const [owner, id] = model.includes('/') ? model.split('/', 2) : ['', model]
  const short = id.replace(/^(jev-\d+\.\d+).*$/, '$1')
  return owner ? `${short} · ${owner}` : short
}

/** The band's segments, or null when the mod has done nothing yet this session. */
export function line(features: Features, now: number): Segment[] | null {
  const routing = features.routing ?? {}
  const calls = features.jev ?? {}
  const screening = features.screening ?? {}
  if (!routing.lane && !calls.calls && !calls.error) return null
  const out: Segment[] = []
  const lane = routing.lane as string | undefined
  if (lane && DIFFICULTY[lane]) {
    if (routing.changed === false) out.push({ text: `🧭 ${DIFFICULTY[lane]}` }, { text: ' · kept', dim: true })
    else {
      const to = [shortModel(routing.lastModel), routing.effort].filter(Boolean).join(' · ')
      out.push({ text: `🧭 ${DIFFICULTY[lane]}${to ? ` → ${to}` : ''}` })
    }
  } else out.push({ text: '🧭 not routed', dim: true })
  if (calls.calls) out.push({ text: '  ' }, { text: money(Number(calls.cost ?? 0)), color: 'yellow' }, { text: ` (${calls.calls})`, dim: true })
  if (screening.withheld) out.push({ text: '  ' }, { text: `🛡 withheld ${screening.withheld}`, color: 'red' })
  const where = `🔌 ${backend(calls.model)}`
  if (calls.error) {
    const left = Number(calls.retryAt ?? 0) - now
    out.push({ text: '  ' }, { text: `${where} ✗ ${calls.error}${left > 0 ? `, retry in ${Math.floor(left / 60_000) + 1}m` : ''}`, color: 'red' })
  } else out.push({ text: '  ' }, { text: where, dim: true })
  return out
}

export const plain = (segments: Segment[]) => segments.map(s => s.text).join('')
