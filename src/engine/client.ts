// One small, strict client for a decision backend (POST /v1/systemone).
//
// The backend answers typed questions about a state: `choice` (one of a closed set), `score`
// (a position on an ordered rubric) and `noul` (probability of yes). It never writes text.
// Every answer is checked against the question that was asked, so a malformed or surprising
// reply becomes a JevError and the caller takes its fail-open path rather than acting on junk.
//
// Ported from jev-skills' jevkit/client.py. test/parity/fixtures/client.json and
// client_ask.json hold Python's answers: every question and answer check, and for each way a
// request can be routed (provider, gateway, named backend, overrides, missing keys, the size
// limit, retries, refused replies) the exact URL, body and headers it sent and what came back.

import * as backends from './backends'
import { BackendError, type Backend } from './backends'
import * as keys from './keys'
import { encode, loads, toPlain } from './pyjson'
import { fullmatch, py, pyFloat, repr, strip, urlsplit } from './pyre'

export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone'
export const DEFAULT_MODEL = 'jev-latest'
// Jev through OpenRouter's Decisions API, Venice, and OpenCode Zen: same request, same
// answers, same model; only the URL and the model id differ.
export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/alpha/decisions'
export const OPENROUTER_MODEL = '~typesafe/jev-latest'
export const VENICE_ENDPOINT = 'https://api.venice.ai/api/v1/decisions'
export const VENICE_MODEL = 'jev-latest'
export const ZEN_ENDPOINT = 'https://opencode.ai/zen/v1/systemone'
export const ZEN_MODEL = 'jev-1.13-free'
export const MAX_RESPONSE_BYTES = 1_000_000
export const MAX_STATE_CHARS = 60_000

const PROVIDER_URL: Record<keys.Provider, string> = {
  typesafe: ENDPOINT, openrouter: OPENROUTER_ENDPOINT, venice: VENICE_ENDPOINT, zen: ZEN_ENDPOINT,
}
const PROVIDER_MODEL: Record<keys.Provider, string> = {
  typesafe: DEFAULT_MODEL, openrouter: OPENROUTER_MODEL, venice: VENICE_MODEL, zen: ZEN_MODEL,
}

/** How this client names itself to a server; jev-skills sent its own name and repo. */
export type Identity = { userAgent: string; referer: string; title: string }
export const IDENTITY: Identity = {
  userAgent: 'jev-mod/0.1.0', referer: 'https://github.com/VictorGambarini/jev-mod', title: 'jev-mod',
}

export class JevError extends Error {
  /** Set only by a contradiction check: which invariant the reply broke. */
  invariant: string | null = null
  constructor(readonly code: string, detail = '', readonly retryAfter: number | null = null) {
    super(detail ? `${code}: ${detail}` : code)
  }
}

// ── question builders ────────────────────────────────────────────────────────

export type Question = { type: 'choice' | 'score' | 'noul'; instructions: unknown; criteria?: unknown }

export function choice(instructions: string, criteria: Record<string, string>): Question {
  if (Object.keys(criteria).length < 2) throw new Error('a choice needs at least two options')
  return { type: 'choice', instructions, criteria: { ...criteria } }
}

export function score(instructions: string, levels: string[]): Question {
  if (levels.length < 2) throw new Error('a score needs at least two levels')
  return { type: 'score', instructions, criteria: [...levels] }
}

/** A yes/no question; `criteria` optionally says what a yes ("true") and a no ("false") mean. */
export function noul(instructions: unknown, criteria?: { true?: unknown; false?: unknown }): Question {
  return criteria === undefined ? { type: 'noul', instructions } : { type: 'noul', instructions, criteria: { ...criteria } }
}

// ── the shape of a question ──────────────────────────────────────────────────
//
// A hand-written question used to reach the wire and then fail the reply check. The rules
// live here, once, and `ask` applies them to everything it is handed.

export const QUESTION_TYPES = ['choice', 'score', 'noul']
const MIN_CRITERIA = 2
// The API's own limits: at most 255 options in a choice, and a score of 2 to 10 levels.
// Refused here, because the API answers either with a 422 every feature reads as "no opinion".
export const MAX_CHOICE_OPTIONS = 255
export const MAX_SCORE_LEVELS = 10

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A string with words in it, or a non-empty object or array: what the API takes as text. */
function structured(value: unknown): boolean {
  if (typeof value === 'string') return Boolean(strip(value))
  if (Array.isArray(value)) return value.length > 0
  return isObject(value) && Object.keys(value).length > 0
}

// Python's [\W_]+: anything but a letter or digit, in any script.
const NOT_WORD = /[^\p{L}\p{N}]+/gu
const identifier = (text: unknown) => strip(String(text).toLowerCase().replace(NOT_WORD, ' '))

/** A refusal quotes part of the caller's own input back, never all of it. */
function shown(value: unknown): string {
  const text = [...(typeof value === 'string' ? value : encode(value))]
  return text.length <= 80 ? text.join('') : text.slice(0, 77).join('') + '...'
}

/** One question in the shape the API answers, or an Error saying what is wrong. */
export function checkQuestion(name: string, question: unknown): Question {
  const q = `question "${shown(name)}"`
  if (!isObject(question)) throw new Error(`${q} must be an object like {"type": ..., "instructions": ...}`)
  const kind = question.type
  if (typeof kind !== 'string' || !QUESTION_TYPES.includes(kind)) {
    const found = kind === undefined || kind === null ? 'has no type' : `has unknown type ${shown(encode(kind))}`
    throw new Error(`${q} ${found}; use one of ${QUESTION_TYPES.join(', ')}`)
  }
  let text = question.instructions
  if (!structured(text)) {
    throw new Error(`${q} has no instructions: the text of the question, as a string (or a non-empty object or array holding it)`)
  }
  if (typeof text === 'string' && identifier(text) === identifier(name)) {
    throw new Error(`${q} asks nothing: its instructions only repeat its own name. The id names the question, "instructions" asks it`)
  }
  if (typeof text !== 'string') text = JSON.parse(JSON.stringify(text))
  const criteria = question.criteria
  if (kind === 'noul') {
    if (criteria === undefined || criteria === null) return { type: 'noul', instructions: text }
    if (!isObject(criteria) || !Object.keys(criteria).length || Object.keys(criteria).some(k => k !== 'true' && k !== 'false')) {
      throw new Error(`${q} is a noul: its criteria, if any, must be {"true": "what a yes means", "false": "what a no means"}; anything else would be sent and never read`)
    }
    for (const [side, meaning] of Object.entries(criteria)) {
      if (!structured(meaning)) throw new Error(`${q}: the noul criterion "${side}" is empty`)
    }
    return { type: 'noul', instructions: text, criteria: { ...criteria } }
  }
  const shape = kind === 'choice' ? 'an object of 2 to 255 options, {"option": "what it means"}' : 'a list of 2 to 10 levels, lowest first'
  if (criteria === undefined || criteria === null) throw new Error(`${q}: criteria are required for a ${kind}, as ${shape}`)
  const count = Array.isArray(criteria) ? criteria.length : isObject(criteria) ? Object.keys(criteria).length : 0
  if ((kind === 'choice' ? !isObject(criteria) : !Array.isArray(criteria)) || count < MIN_CRITERIA) {
    throw new Error(`${q}: criteria for a ${kind} must be ${shape}`)
  }
  if (kind === 'choice') {
    if (count > MAX_CHOICE_OPTIONS) {
      throw new Error(`${q}: ${count} options; a choice takes at most ${MAX_CHOICE_OPTIONS}. Pick a group first, then a member`)
    }
    return { type: 'choice', instructions: text, criteria: { ...(criteria as Record<string, unknown>) } }
  }
  if (count > MAX_SCORE_LEVELS) throw new Error(`${q}: ${count} levels; a score takes at most ${MAX_SCORE_LEVELS}`)
  ;(criteria as unknown[]).forEach((level, position) => {
    if (!structured(level)) throw new Error(`${q}: score level ${position} is empty`)
  })
  return { type: 'score', instructions: text, criteria: [...(criteria as unknown[])] }
}

/** Every question named and shaped, in the order and under the names it was handed. */
export function checkQuestions(questions: unknown): Record<string, Question> {
  if (!isObject(questions)) throw new Error('questions must be a mapping of {name: question}')
  if (!Object.keys(questions).length) throw new Error('no questions')
  return Object.fromEntries(Object.entries(questions).map(([name, question]) => [name, checkQuestion(name, question)]))
}

// ── validation ───────────────────────────────────────────────────────────────

// Tolerances from a validator that already runs against this API (jkudish/jev-mcp, MIT): a
// distribution may miss summing to one by 0.01, a score its own mean by 0.02, and a choice
// must be the argmax. A live probe matched exactly, so these bands are slack for float noise.
export const PROBABILITY_SUM_TOLERANCE = 0.01 + 1e-12
export const SCORE_MEAN_TOLERANCE = 0.02 + 1e-12
export const ARGMAX_TOLERANCE = 1e-9
// The API prints each level's probability to two decimals, so the recomputed mean carries
// rounding that grows with the rubric. Measured on jev-1.13.0: 3.9% of replies on 4- and
// 5-level rubrics were refused for gaps of 0.03-0.04 before this band, and a real
// contradiction (the incident was a gap of 0.73) still does not pass.
export const ROUNDING_STEP = 0.005

export function scoreMeanTolerance(levels: number): number {
  const n = Math.max(Math.trunc(levels), 1)
  return Math.max(SCORE_MEAN_TOLERANCE, ROUNDING_STEP * ((n * (n - 1)) / 2 + 1) + 1e-12)
}

/** A reply that parses but contradicts itself. Typed, named, and never acted on. */
function invalid(name: string, invariant: string, detail = ''): JevError {
  const error = new JevError('invalid_response', `answer ${name} violated ${invariant}` + (detail ? ` (${detail})` : ''))
  error.invariant = invariant
  return error
}

function unit(value: unknown, name: string): number {
  if (typeof value !== 'number') throw new JevError('malformed', `${name} is not numeric`)
  if (!Number.isFinite(value) || !(-1e-6 <= value && value <= 1 + 1e-6)) throw new JevError('malformed', `${name} is outside 0..1`)
  return Math.min(1, Math.max(0, value))
}

/** A probability mass over exactly `keys`: complete, finite, and summing to one. */
function distribution(name: string, raw: unknown, keyList: string[], invariant: string): Record<string, number> {
  if (!isObject(raw)) throw invalid(name, invariant, 'probabilities are not an object')
  const expected = new Set(keyList)
  const found = new Set(Object.keys(raw))
  if (found.size !== expected.size || [...found].some(k => !expected.has(k))) {
    const missing = [...expected].filter(k => !found.has(k)).sort()
    const extra = [...found].filter(k => !expected.has(k)).sort()
    throw invalid(name, invariant, `missing ${missing.length ? repr(String(missing)) : 'none'}, unexpected ${extra.length ? repr(String(extra)) : 'none'}`)
  }
  const values: Record<string, number> = {}
  for (const key of keyList) values[key] = unit(raw[key], `${name}.p[${key}]`)
  const total = keyList.reduce((sum, key) => sum + values[key]!, 0)
  if (Math.abs(total - 1) > PROBABILITY_SUM_TOLERANCE) throw invalid(name, invariant, `mass sums to ${total}`)
  return values
}

/** Python's str.isdigit() then int(), for a rubric level written as a key. */
function level(key: string): number | null {
  if (!/^\p{Nd}+$/u.test(key)) return null
  let n = 0
  for (const c of key) {
    let cp = c.codePointAt(0)!
    let steps = 0
    while (steps < 40 && /^\p{Nd}$/u.test(String.fromCodePoint(cp - 1))) { cp--; steps++ }
    n = n * 10 + (c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : steps % 10)
  }
  return n
}

export type Answer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'score'; score: number; probabilities: Record<number, number>; spread_reported: boolean; confidence: number; legend?: Record<number, string> }

export function checkAnswer(name: string, question: Question, answer: unknown): Answer {
  if (!isObject(answer) || answer.type !== question.type) throw new JevError('malformed', `answer ${name} has the wrong type`)
  if (question.type === 'noul') return { type: 'noul', noul: unit(answer.noul, `${name}.noul`) }
  if (question.type === 'choice') {
    const options = Object.keys(question.criteria as Record<string, unknown>)
    const picked = answer.choice
    if (typeof picked !== 'string' || !options.includes(picked)) {
      throw new JevError('malformed', `answer ${name} chose an option that was not offered`)
    }
    const probabilities = distribution(name, answer.probabilities, options, 'choice_probability_key_set')
    const top = Math.max(...Object.values(probabilities))
    if (probabilities[picked]! < top - ARGMAX_TOLERANCE) {
      // A choice that is not the maximum means the ranking callers read and the label they
      // act on are two different answers.
      throw invalid(name, 'choice_is_argmax', `chose ${picked} at ${probabilities[picked]} against a maximum of ${top}`)
    }
    return { type: 'choice', choice: picked, probabilities, confidence: unit(answer.confidence, `${name}.confidence`) }
  }
  const levels = (question.criteria as unknown[]).length
  const value = answer.score
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new JevError('malformed', `answer ${name} has no numeric score`)
  if (!(-0.5 <= value && value <= levels - 0.5)) throw new JevError('malformed', `answer ${name} scored off the rubric`)
  // The per-level spread says far more than the averaged score. A score may arrive with no
  // distribution at all; it is kept, and `spread_reported` says so.
  const raw = answer.probabilities
  const spread: Record<number, number> = {}
  if (isObject(raw) && Object.keys(raw).length) {
    const keyList: string[] = []
    for (const key of Object.keys(raw)) {
      const n = level(key)
      if (n === null || n >= levels) throw invalid(name, 'score_distribution_on_rubric', `level ${repr(key)} is not 0..${levels - 1}`)
      keyList.push(key)
    }
    keyList.sort((a, b) => level(a)! - level(b)!)
    const mass = distribution(name, raw, keyList, 'score_distribution_mass')
    for (const key of keyList) spread[level(key)!] = mass[key]!
    const mean = Object.entries(spread).reduce((sum, [l, p]) => sum + Number(l) * p, 0)
    if (Math.abs(mean - value) > scoreMeanTolerance(levels)) {
      // The incident: a flat 0.2-each spread that averaged to 2.73 was filed at level 4 of 5.
      throw invalid(name, 'score_matches_its_distribution', `score ${value} against an expected value of ${mean}`)
    }
  }
  // The legend is how the model read the rubric; when it differs from ours, that is worth seeing.
  const legend: Record<number, string> = {}
  if (isObject(answer.legend)) {
    for (const [key, text] of Object.entries(answer.legend)) {
      const n = level(key)
      if (n !== null && n < levels && typeof text === 'string') legend[n] = text
    }
  }
  const out: Answer = {
    type: 'score', score: value, probabilities: spread, spread_reported: Object.keys(spread).length > 0,
    confidence: unit('confidence' in answer ? answer.confidence : 1.0, `${name}.confidence`),
  }
  if (Object.keys(legend).length) out.legend = legend
  return out
}

// ── transport ────────────────────────────────────────────────────────────────

/** What the client needs from the outside world, beyond key lookup. */
export interface Host extends keys.KeyHost {
  /** One POST; resolves with the reply, rejects on a network failure or after `timeoutMs`. */
  post(url: string, body: string, headers: Record<string, string>, timeoutMs: number):
    Promise<{ status: number; text: string; headers: Record<string, string> }>
  now(): number
  sleep(ms: number): Promise<void>
}

const STATUS: Record<number, string> = {
  301: 'http_301', 302: 'http_302', 303: 'http_303', 307: 'http_307', 308: 'http_308',
  401: 'auth_failed', 403: 'auth_failed', 402: 'credits_exhausted', 429: 'rate_limited', 529: 'overloaded',
}
export const RETRYABLE = new Set(['rate_limited', 'overloaded', 'network', 'http_500', 'http_502', 'http_503', 'http_504'])
// The failures that are the backend's, not the request's: every code a retry is for, and a
// timeout. core/jev.ts cools off after one, and /jev-mod status calls it an outage. A refusal
// of the key or the account (REFUSED) cools off too, longer: it does not mend by itself.
export const OUTAGES: readonly string[] = [...RETRYABLE, 'timeout']
export const REFUSED: readonly string[] = ['auth_failed', 'credits_exhausted']
export const MAX_RETRY_AFTER_MS = 60_000

/**
 * The start of the server's own explanation of a refused request. Auth failures and redirects
 * keep none: a gateway's auth error is the one place a token could be echoed back.
 */
function errorExcerpt(status: number, text: string): string {
  if ([301, 302, 303, 307, 308, 401, 403].includes(status)) return ''
  const head = new TextDecoder().decode(new TextEncoder().encode(text).slice(0, 400))
  return [...strip(head).split(py('\\s+')).filter(Boolean).join(' ')].slice(0, 300).join('')
}

/** retry-after-ms first, then retry-after, in ms; numeric only, capped at a minute. */
export function retryAfterMs(headers: Record<string, string>): number | null {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  for (const [name, scale] of [['retry-after-ms', 1], ['retry-after', 1000]] as const) {
    const raw = lower[name]
    if (raw === undefined) continue
    const value = pyFloat(String(raw))
    if (value === null) return null
    const ms = value * scale
    if (Number.isFinite(ms) && ms >= 0) return Math.min(ms, MAX_RETRY_AFTER_MS)
  }
  return null
}

/** POST once. Redirects are errors, never hops: a redirect would carry the bearer elsewhere. */
async function send(host: Host, url: string, body: string, headers: Record<string, string>, timeoutMs: number): Promise<string> {
  let reply: { status: number; text: string; headers: Record<string, string> }
  try {
    reply = await host.post(url, body, headers, timeoutMs)
  } catch {
    throw new JevError('network')
  }
  if (new TextEncoder().encode(reply.text).length > MAX_RESPONSE_BYTES) throw new JevError('response_too_large')
  if (reply.status !== 200) {
    const retry = retryAfterMs(reply.headers ?? {})
    throw new JevError(STATUS[reply.status] ?? `http_${reply.status}`, errorExcerpt(reply.status, reply.text),
      retry === null ? null : retry)
  }
  return reply.text
}

// A path prefix is plain segments: no spaces, controls, dot segments, backslashes or
// percent-escapes, so the endpoint that is validated is the endpoint that is requested.
const PATH_PREFIX = py("(?:/(?!\\.\\.?(?:/|$))[A-Za-z0-9._~!$&'()*+,;=:@-]+)*/?")

/**
 * TYPESAFE_BASE_URL: an explicit compatible server, which never receives a provider key. A
 * path prefix becomes part of the endpoint: https://gw.example/jev -> .../jev/v1/systemone.
 * Unlike client.py, a URL carrying whitespace, controls, "?", "#" or "@" is refused outright:
 * Python's parser dropped them before checking and the request then sent them (divergence).
 */
export function customEndpoint(base: string): string {
  let parsed
  let port
  try {
    parsed = urlsplit(base)
    port = parsed.port()
  } catch {
    throw new JevError('invalid_endpoint')
  }
  if (!['http', 'https'].includes(parsed.scheme) || !parsed.hostname || parsed.username || parsed.password
    || parsed.query || parsed.fragment || (parsed.scheme === 'http' && !['127.0.0.1', '::1'].includes(parsed.hostname))
    || !fullmatch(PATH_PREFIX, parsed.path) || !parsed.netloc || port === 0
    || /[\x00-\x20\x7f?#@]/.test(base)) {
    throw new JevError('invalid_endpoint')
  }
  return base.replace(/\/+$/, '') + '/v1/systemone'
}

// ── public call ──────────────────────────────────────────────────────────────

export type AskOptions = {
  timeoutMs?: number
  retries?: number
  model?: string
  apiKey?: string
  provider?: keys.Provider
  backend?: Backend
  /** Wait out a 429/529's retry-after within the budget: batch jobs only, never a live caller. */
  patient?: boolean
  identity?: Identity
}

export type Asked = {
  answers: Record<string, Answer>
  usage: Record<string, unknown>
  latency_ms: number
  jev_model: string | null
  input_tokens: number | null
  provider: string
}

/** The backend decisions go to, or null for the providers; BackendError when misconfigured. */
export async function activeBackend(host: Host): Promise<Backend | null> {
  const explicit = strip((await host.env('JEV_BACKENDS')) ?? '')
  const path = explicit ? (explicit.startsWith('~') ? (await host.home()) + explicit.slice(1) : explicit)
    : `${await keys.configDir(host)}/backends.json`
  const text = await host.readFile(path)
  return backends.active(await host.env('JEV_BACKEND'), () => backends.readFile(text, path), path)
}

/**
 * Ask every question against one state, in a single request. Throws JevError for anything the
 * caller should not act on; `timeoutMs` is a total budget across retries.
 *
 * Where it goes, first match wins: an explicit backend; an explicit provider or apiKey;
 * TYPESAFE_BASE_URL; the named backend JEV_BACKEND or backends.json selects; then the
 * providers in order.
 */
export async function ask(host: Host, state: unknown, questions: Record<string, unknown>, options: AskOptions = {}): Promise<Asked> {
  const timeoutMs = options.timeoutMs ?? 4000
  const retries = options.retries ?? 1
  const identity = options.identity ?? IDENTITY
  if (!questions || !Object.keys(questions).length) throw new Error('no questions')
  const checked = checkQuestions(questions)
  let base = strip((await host.env('TYPESAFE_BASE_URL')) ?? '')
  if (base.replace(/\/+$/, '') === 'https://api.typesafe.ai') base = '' // the official URL keeps the official flow
  let backend = options.backend ?? null
  if (!backend && !(options.provider || options.apiKey || base)) {
    try {
      backend = await activeBackend(host)
    } catch (error) {
      if (error instanceof BackendError) throw new JevError('backend_misconfigured', error.message)
      throw error
    }
  }
  let via: string
  let endpoint: string | null
  let key: string | undefined
  let defaultModel: string
  if (backend) {
    // A named backend gets its own key and nothing else, and its key goes nowhere else.
    via = backend.name
    endpoint = backend.url
    key = options.apiKey || await keys.backendKey(host, backend)
    defaultModel = (await host.env('JEV_MODEL')) || backend.model
  } else {
    let chosen: string = options.provider ?? (options.apiKey || base ? 'typesafe' : await keys.provider(host))
    if (!(keys.PROVIDERS as readonly string[]).includes(chosen)) chosen = 'typesafe'
    via = chosen
    endpoint = base && via === 'typesafe' ? customEndpoint(base) : null
    // A compatible endpoint never gets a provider key: only JEV_PROXY_API_KEY, set for it alone.
    key = endpoint ? strip((await host.env('JEV_PROXY_API_KEY')) ?? '') || undefined
      : options.apiKey || await keys.providerKey(host, via as keys.Provider)
    if (!key && !endpoint) throw new JevError('no_key', 'run `jev setup-key`')
    defaultModel = (await host.env('TYPESAFE_MODEL')) || PROVIDER_MODEL[via as keys.Provider]
  }
  const encodedState = typeof state === 'string' ? state : encode(state, { compact: true })
  if ([...encodedState].length > MAX_STATE_CHARS) throw new JevError('state_too_large')
  const body = encode({ state, model: options.model || defaultModel, questions: checked }, { compact: true })
  const headers: Record<string, string> = {
    'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': identity.userAgent,
  }
  if (key) headers.Authorization = `Bearer ${key}`
  if (via === 'openrouter') {
    // OpenRouter asks callers to identify themselves; neither header says anything about the person.
    headers['HTTP-Referer'] = identity.referer
    headers['X-Title'] = identity.title
  }
  const url = endpoint ?? PROVIDER_URL[via as keys.Provider]

  const started = host.now()
  let attempt = 0
  let raw: string
  for (;;) {
    const remaining = timeoutMs - (host.now() - started)
    if (remaining <= 50) throw new JevError('timeout')
    try {
      raw = await send(host, url, body, headers, remaining)
      break
    } catch (error) {
      if (!(error instanceof JevError)) throw error
      attempt++
      if (!RETRYABLE.has(error.code) || attempt > retries) throw error
      const left = Math.max(0, timeoutMs - (host.now() - started) - 100)
      let wait = Math.min(250 * attempt, left)
      if (options.patient && error.retryAfter !== null) {
        if (error.retryAfter > left) throw error // told to wait past the budget: stop now
        wait = error.retryAfter
      }
      await host.sleep(wait)
    }
  }

  let payload: unknown
  try {
    payload = toPlain(loads(raw))
  } catch {
    throw new JevError('malformed', 'reply is not JSON')
  }
  const answers = isObject(payload) ? payload.answers : undefined
  if (!isObject(answers)) throw new JevError('malformed', 'reply has no answers')
  const validated: Record<string, Answer> = {}
  for (const [name, question] of Object.entries(checked)) validated[name] = checkAnswer(name, question, answers[name])
  const p = payload as Record<string, unknown>
  const usage = isObject(p.usage) ? p.usage : {}
  const tokens = usage.input_tokens
  return {
    answers: validated,
    usage,
    latency_ms: Math.trunc(host.now() - started),
    jev_model: typeof p.model === 'string' && p.model ? p.model : null,
    input_tokens: typeof tokens === 'number' && Number.isFinite(tokens) && tokens >= 0 ? Math.trunc(tokens) : null,
    provider: backend ? via : endpoint ? 'custom' : via,
  }
}

// ── what a call cost ─────────────────────────────────────────────────────────

// Jev's list price per input token, and the model ids served free. ledger.py in jev-skills.
export const USD_PER_INPUT_TOKEN = 0.042 / 1_000_000
export const FREE_MODELS = ['jev-1.13-free']

/**
 * Billed dollars for one call. A free tier bills nothing at the same size, and a named backend
 * is someone's own server whose price nothing here knows, so it bills nothing either.
 */
export function costOf(asked: Pick<Asked, 'input_tokens' | 'provider' | 'jev_model'>): number {
  const listed = Math.round((asked.input_tokens ?? 0) * USD_PER_INPUT_TOKEN * 1e8) / 1e8
  const model = asked.jev_model ?? ''
  const free = FREE_MODELS.includes(model) || (asked.provider === 'zen' && model.endsWith('-free'))
    || !['typesafe', 'openrouter', 'venice', 'zen', 'custom'].includes(asked.provider)
  return free ? 0 : listed
}
