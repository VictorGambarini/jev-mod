import type { AccessState } from '../../../types'
import * as activity from '../../core/activity'
import { setting } from '../../core/config'
import type { IO } from '../../core/io'
import type { Mode } from '../../core/registry'
import {
  ABOUT, CATEGORIES, categoriesIn, concerns, hitsOf, judge, label, refusal, type Category, type Grants,
} from './rules'

// The access gate: before a tool call runs, a local reading of it (no decision model) for what
// reaches another machine (ssh, a remote desktop, a cloud shell, a fleet, a tunnel, a remote
// database, telnet and kin, a scan) or reads the keys that would. A category this session has
// not allowed is refused (tool.check's deny, which bypass mode does not wave through as it would
// an ask), and the model is told to ask the person.
//
// The person allows a category for this session with /jev-mod access <category> on, typed at the
// prompt. Allows live in the host's session state ($.state), never on disk: a new session starts
// with every category blocked again. `alwaysAllow` (the user's own file only: the feature is
// protective) opens a category in every session.

export const ID = 'access-gate'

export type Gate = { decision: 'deny'; reason: string } | null

type Call = { tool: string; input: unknown }

/** This session's allows, from the host's session state; none when they belong to another session or cannot be read. */
export async function grantsOf(io: IO): Promise<Grants> {
  try {
    const [state, session] = await Promise.all([io.accessState(), io.sessionId()])
    if (!state || session === null || state.session !== session) return {}
    return state.grants as Grants
  } catch {
    return {}
  }
}

async function setGrants(io: IO, grants: Grants): Promise<boolean> {
  const session = await io.sessionId().catch(() => null)
  if (session === null) return false
  await io.setAccessState({ session, grants } as AccessState)
  return true
}

/**
 * What the gate makes of one call: a deny naming the category, the command and what to do, or
 * null to leave the verdict as it is. A tool it never judges costs nothing; off costs one read of
 * the config. In shadow it only counts what it would have refused.
 */
export async function check(io: IO, e: Call): Promise<Gate> {
  if (!concerns(e.tool)) return null
  const resolved = await setting(io, ID)
  if (resolved.mode === 'off') return null
  const hits = hitsOf(e.tool, e.input, await io.home())
  if (!hits.length) return null
  const always = categoriesIn(resolved.knobs.alwaysAllow?.value)
  const allowLocalhost = resolved.knobs.allowLocalhost?.value !== false
  const grants = await grantsOf(io)
  const verdict = judge(hits, grants, always, allowLocalhost)
  if (!verdict.blocked.length) {
    if (verdict.allowed.length) await activity.count(io, ID, 'allowed')
    return null
  }
  if (resolved.mode !== 'on') {
    await activity.count(io, ID, 'would-block')
    return null
  }
  await activity.count(io, ID, 'blocked')
  return { decision: 'deny', reason: refusal(verdict.blocked, grants) }
}

/** The categories open now, as the band shows them (`ssh`, `ssh (vm1)`); none while the gate is off. */
export async function open(io: IO): Promise<string[]> {
  try {
    const resolved = await setting(io, ID)
    if (resolved.mode === 'off') return []
    const always = categoriesIn(resolved.knobs.alwaysAllow?.value)
    const grants = await grantsOf(io)
    return CATEGORIES.filter(c => always.includes(c) || grants[c]).map(c => label(c, always.includes(c) ? undefined : grants[c]))
  } catch {
    return []
  }
}

// ── /jev-mod access ──────────────────────────────────────────────────────────

export type AccessAction =
  | { kind: 'access-show' }
  | { kind: 'access-set'; category: Category | 'all'; on: boolean; host?: string }

/** Where a command came from, as command.run's `origin` says; only the person's own may open a category. */
export type Origin = { kind: string } | undefined

const PERSON = new Set(['composer', 'bridge'])

function describe(mode: Mode, always: readonly Category[], grants: Grants): string {
  const width = Math.max(...CATEGORIES.map(c => c.length))
  const lines = [`access gate: ${mode}${mode === 'off' ? ' (nothing is blocked; /jev-mod access-gate on turns it on)'
    : mode === 'shadow' ? ' (nothing is blocked; would-block is counted)' : ''}`]
  for (const c of CATEGORIES) {
    const state = always.includes(c) ? 'allowed in every session (alwaysAllow)'
      : grants[c] ? `allowed this session${grants[c]!.hosts?.length ? ` to ${grants[c]!.hosts!.join(', ')}` : ''}` : 'blocked'
    lines.push(`${c.padEnd(width)}  ${state.padEnd(24)}  ${ABOUT[c]}`)
  }
  lines.push('/jev-mod access <category> on [host] allows one for this session; /jev-mod access <category> off or all off closes it.')
  return lines.join('\n')
}

/** /jev-mod access, and /jev-mod access <category|all> on|off [host]. */
export async function command(io: IO, action: AccessAction, origin: Origin): Promise<{ text: string }> {
  const resolved = await setting(io, ID)
  const always = categoriesIn(resolved.knobs.alwaysAllow?.value)
  const grants = { ...(await grantsOf(io)) }
  if (action.kind === 'access-show') return { text: describe(resolved.mode, always, grants) }

  if (action.on) {
    if (!origin || !PERSON.has(origin.kind)) {
      return { text: `/jev-mod access ${action.category} on must be typed by the person at the prompt; it was not changed.` }
    }
    if (action.category === 'all') return { text: 'name one category to allow; all only closes them: /jev-mod access all off' }
    const had = grants[action.category]
    const hosts = action.host
      ? [...new Set([...(had?.hosts ?? []), action.host.toLowerCase()])]
      : undefined
    // a host added to an allow open to every host leaves it open to every host
    grants[action.category] = had && !had.hosts?.length && action.host ? had : hosts ? { hosts } : {}
  } else if (action.category === 'all') {
    for (const c of CATEGORIES) delete grants[c]
  } else {
    delete grants[action.category]
  }
  if (!(await setGrants(io, grants))) return { text: 'jev-mod: this session has no id yet, so nothing was changed.' }
  const lines = [describe(resolved.mode, always, grants)]
  if (!action.on && action.category !== 'all' && always.includes(action.category)) {
    lines.push(`warning: ${action.category} stays allowed: alwaysAllow in your file opens it in every session (/jev-mod access-gate alwaysAllow <list>).`)
  }
  return { text: lines.join('\n') }
}
