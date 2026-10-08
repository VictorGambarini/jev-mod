// Named decision backends: any server that answers the systemone protocol, not only Jev.
//
// The built-in providers (TypeSafe, OpenRouter, Venice, Zen) all serve the same Jev model and
// keep their own key handling in keys.ts. A backend here is anything else that speaks the
// same wire protocol (a self-hosted decision model, a gateway, a local mock), named once in
// ~/.config/jev/backends.json and selected by JEV_BACKEND or the file's "default":
//
//   {"default": "lais05",
//    "backends": {"lais05": {"protocol": "systemone",
//                            "url": "https://lais05.example/v1/systemone",
//                            "model": "Cloudflare/clef-flash"}}}
//
// A backend's key is its own (keys.ts) and is only ever sent to that backend's own URL.
//
// Ported from jev-skills' jevkit/backends.py and tuning.check, reading the same file, so an
// install set up with `jev backend add` keeps working. Where the URL rules differ from
// backends.py, test/parity/divergences.ts says so: the URL that is checked must be the URL
// that is requested, and Python's parser drops characters the request then still carries.

import { loads, toPlain } from './pyjson'
import { fullmatch, py, repr, strip, urlsplit, type SplitURL } from './pyre'

export const PROTOCOLS = ['systemone'] as const
// Names the built-in providers already use: a backend may not shadow one, or `JEV_BACKEND=zen`
// would mean two different things depending on whether a file exists.
export const RESERVED = ['typesafe', 'openrouter', 'venice', 'zen', 'custom', 'absent', 'default', 'none']
const NAME = py('[a-z0-9][a-z0-9-]{0,31}')
const KEY_ENV = py('[A-Z][A-Z0-9_]{0,63}')
// Plain path segments only: the URL that is validated is the URL that is requested.
const PATH = py("(?:/(?!\\.\\.?(?:/|$))[A-Za-z0-9._~!$&'()*+,;=:@-]+)+/?")
const LOOPBACK = ['127.0.0.1', '::1', 'localhost']

export class BackendError extends Error {}

export type Backend = {
  name: string
  url: string
  model: string
  protocol: 'systemone'
  keyEnv: string
  tuning: Record<string, number>
}

export function defaultKeyEnv(name: string): string {
  return 'JEV_BACKEND_' + name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_API_KEY'
}

export const keyVariable = (backend: Backend) => backend.keyEnv || defaultKeyEnv(backend.name)

// ── tuning: thresholds that belong to the decision model ─────────────────────
// key -> [Jev default, lowest, highest] as Python wrote them (the bounds appear in messages).
export const KNOBS: Record<string, [number, string, string]> = {
  'choose.min_confidence': [0.65, '0.5', '0.99'],
  'choose.dead_repeats': [2, '1', '10'],
  'skillpick.need_threshold': [0.5, '0.0', '1.0'],
  'skillpick.match_threshold': [0.5, '0.0', '1.0'],
  'skillpick.shortlist_floor': [0.02, '0.0', '0.5'],
  'search.sufficiency_threshold': [0.5, '0.0', '1.0'],
  'webscreen.injection_threshold': [0.5, '0.0', '1.0'],
}

export function checkTuning(raw: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in KNOBS)) throw new Error(`unknown tuning key ${repr(key)}; known: ${Object.keys(KNOBS).sort().join(', ')}`)
    if (typeof value !== 'number') throw new Error(`tuning ${key} must be a number`)
    const [, low, high] = KNOBS[key]!
    if (!(Number(low) <= value && value <= Number(high))) throw new Error(`tuning ${key} must be between ${low} and ${high}`)
    out[key] = value
  }
  return out
}

/** A backend's value for a threshold, else the Jev default. */
export function tuned(backend: Backend | null, key: string): number {
  return backend?.tuning[key] ?? KNOBS[key]![0]
}

// ── URLs ─────────────────────────────────────────────────────────────────────

/**
 * Characters Python's urlsplit drops or reads past, which then still travel in the request:
 * whitespace and controls anywhere, "?" or "#" with nothing after them, and "@" with an empty
 * user. backends.py accepted "https://gw.example/x?" (the endpoint then became
 * ".../x?/v1/systemone", a query string) and "https://gw.ex\tample/x". Divergence.
 */
function smuggles(url: string): boolean {
  return /[\x00-\x20\x7f]/.test(url) || url.includes('?') || url.includes('#') || url.includes('@')
}

function split(url: string): [SplitURL, number | null] | null {
  try {
    const parsed = urlsplit(url)
    return [parsed, parsed.port()]
  } catch {
    return null
  }
}

/** https anywhere, http only on loopback; no credentials, query or fragment in the URL. */
export function checkUrl(url: string): string {
  const s = strip(url)
  const parts = split(s)
  if (!parts) throw new BackendError(`not a usable URL: ${repr(url)}`)
  const [parsed, port] = parts
  if (!['http', 'https'].includes(parsed.scheme) || !parsed.hostname || port === 0) {
    throw new BackendError('the URL must be http(s)://host/path')
  }
  if (parsed.scheme === 'http' && !LOOPBACK.includes(parsed.hostname)) {
    throw new BackendError('plain http is allowed only on 127.0.0.1, ::1 or localhost; use https')
  }
  if (parsed.username || parsed.password || parsed.query || parsed.fragment) {
    throw new BackendError('the URL may not carry a user, password, query or fragment')
  }
  if (!fullmatch(PATH, parsed.path)) {
    throw new BackendError('the URL needs the full endpoint path, like https://host/v1/systemone')
  }
  if (smuggles(s)) throw new BackendError('the URL may not carry a user, password, query or fragment')
  return s.replace(/\/+$/, '')
}

// ── backends.json ────────────────────────────────────────────────────────────

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function parse(name: string, raw: unknown): Backend {
  if (!fullmatch(NAME, name) || RESERVED.includes(name)) {
    throw new BackendError(`backend name ${repr(name)}: use lowercase letters, digits and dashes, and not one of ${RESERVED.join(', ')}`)
  }
  if (!isObject(raw)) throw new BackendError(`backend ${repr(name)} must be an object`)
  const protocol = raw.protocol ?? 'systemone'
  if (!(PROTOCOLS as readonly unknown[]).includes(protocol)) {
    throw new BackendError(`backend ${repr(name)}: protocol must be one of ${PROTOCOLS.join(', ')}`)
  }
  const model = raw.model
  if (typeof model !== 'string' || !strip(model)) throw new BackendError(`backend ${repr(name)} needs a model id`)
  const keyEnv = raw.key_env || ''
  if (keyEnv && (typeof keyEnv !== 'string' || !fullmatch(KEY_ENV, keyEnv))) {
    throw new BackendError(`backend ${repr(name)}: key_env must be an UPPER_CASE variable name`)
  }
  const rawTuning = raw.tuning || {}
  if (!isObject(rawTuning)) throw new BackendError(`backend ${repr(name)}: tuning must be an object`)
  let tuning: Record<string, number>
  try {
    tuning = checkTuning(rawTuning)
  } catch (error) {
    throw new BackendError(`backend ${repr(name)}: ${(error as Error).message}`)
  }
  return { name, url: checkUrl(String(raw.url || '')), model: strip(model), protocol: 'systemone', keyEnv: keyEnv as string, tuning }
}

export type BackendsFile = { default: unknown; backends: Record<string, unknown> }

/** The file's text (undefined when there is no file) as backends.py's load_file reads it. */
export function readFile(text: string | undefined, path: string): BackendsFile {
  if (text === undefined) return { default: null, backends: {} }
  let data: unknown
  try {
    data = toPlain(loads(text))
  } catch (error) {
    throw new BackendError(`${path} could not be read: ${(error as Error).message}`)
  }
  if (!isObject(data) || !isObject(data.backends ?? {})) {
    throw new BackendError(`${path} must be an object with a "backends" object`)
  }
  return { default: data.default ?? null, backends: (data.backends ?? {}) as Record<string, unknown> }
}

/**
 * The backend decisions go to, or null for the built-in provider order. JEV_BACKEND wins over
 * the file's default; "default" or "none" means the providers; a provider's name too. A
 * selection that names a backend that does not exist is an error rather than a silent fall
 * back to a provider: the person asked for their own model.
 */
export function active(pinned: string | undefined, file: () => BackendsFile, path: string): Backend | null {
  const pin = strip(pinned ?? '')
  if (pin === 'default' || pin === 'none') return null
  if (['typesafe', 'openrouter', 'venice', 'zen'].includes(pin)) return null
  const data = file()
  const name = pin || data.default
  if (!name) return null
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(data.backends, name)) {
    throw new BackendError(`backend ${repr(String(name))} is selected but not defined in ${path}`)
  }
  return parse(name, data.backends[name])
}
