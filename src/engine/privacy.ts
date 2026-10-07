// The outbound boundary. Everything sent to a decision backend passes through here first.
//
// Two tools: `redact` masks things that look like secrets or contact details, and
// `isSensitive` says "do not send this at all". Callers that get true from `isSensitive`
// must skip the backend and take their fail-open path.
//
// Ported from jev-skills' jevkit/privacy.py; test/parity/fixtures/privacy.json holds its
// answers over 847 inputs and privacy.test.ts requires these to match every one. The rules'
// reasons are kept beside them, as in the original.
//
// Python's \d, \w and \b are Unicode-aware and JavaScript's are ASCII, so the patterns are
// written as Python wrote them and translated by `py` below; lengths are counted in code
// points, as Python counts them, not UTF-16 units.

const WORD = '[\\p{L}\\p{N}_]'

/** Compile a Python `re` pattern: Unicode \d, \D, \w and \b, and the `u` flag. */
function py(source: string, flags = ''): RegExp {
  const translated = source
    .replace(/\\b/g, `(?:(?<=${WORD})(?!${WORD})|(?<!${WORD})(?=${WORD}))`)
    .replace(/\\d/g, '\\p{Nd}')
    .replace(/\\D/g, '\\P{Nd}')
    .replace(/\\w/g, WORD)
  return new RegExp(translated, 'u' + flags)
}

const SECRET_WORDS = py(
  'api[_ -]?key|access[_ -]?token|authorization\\s*:|bearer\\s+[a-z0-9._-]{8,}|password|passwd|' +
  'client[_ -]?secret|session[_ -]?cookie|credit[_ -]?card|card[_ -]?number|' +
  '\\bcvv\\b|\\bssn\\b|private[_ -]?key|BEGIN [A-Z ]*PRIVATE KEY', 'i')
// An env-var name is how a secret usually appears in agent output: AWS_SECRET_ACCESS_KEY,
// STRIPE_SECRET, DB_PASSWORD, GITHUB_TOKEN. Matching only `secret_key` missed every one of
// them, because the revealing word sits in the middle of the name, not at its end.
const SECRET_ASSIGNMENT_SOURCE =
  '\\b[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*[_-]' +
  '(?:SECRET|SECRET[_-]?\\w*KEY|API[_-]?KEY|KEY|TOKEN|PASSWORD|PASSWD|CREDENTIALS?|AUTH)\\b' +
  '\\s*[:=]\\s*\\S*'
const SECRET_NAME = py('\\bsecret[_ -](?:access[_ -])?key\\b|\\bsecret[_ -]?key\\b', 'i')
const TOKEN_SHAPES_SOURCE =
  '\\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|' +
  'AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|apikey_[A-Za-z0-9_]{20,}|' +
  'eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{5,})\\b'
const EMAIL = py('\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b', 'g')
const PHONE = py('(?<!\\d)(?:\\+?\\d{1,3}[\\s.-]?)?(?:\\(\\d{3}\\)|\\d{3})[\\s.-]?\\d{3}[\\s.-]?\\d{4}(?!\\d)', 'g')
// The keyword rules above only fire on a label. A bank alert or an order receipt carries
// the card number with no trigger word anywhere near it, and "4111 1111 1111 1111" went
// out verbatim. Luhn is what keeps this from eating order and reference numbers.
const CARD = py('(?<![\\d.-])(?:\\d[ -]?){12,18}\\d(?![\\d.-])', 'g')
// PHONE is a North American shape: three, three, four. Two lines of a European signature
// ("+44 20 7946 0958", "+33 1 70 18 99 00") walked straight past it.
const INTL_PHONE = py('(?<![\\d+])\\+\\d{1,3}[\\s.-]?(?:\\d[\\s.-]?){7,13}\\d(?!\\d)', 'g')
// A credential with no label at all: an AWS secret access key is 40 base64 characters and
// the word "secret" never appears beside it. Mixed case AND a digit is what separates it
// from a word, a hex digest (already [hex] by the time this runs) or a slug.
const HIGH_ENTROPY = py('(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/_-]{32,}={0,2}(?![A-Za-z0-9+/=_-])', 'g')
// A UPS tracking number's digit tail parses as country-code + 3 + 3 + 4, so the phone rule
// ate it. Hold those aside instead of blunting the phone rule (which would let
// "x8505550134" through). Pure-digit carrier formats are already safe: PHONE's trailing
// (?!\d) refuses to match a prefix of a longer run.
const TRACKING = py('\\b1Z[0-9A-Z]{16}\\b', 'gi')
const LONG_HEX = py('\\b[a-fA-F0-9]{32,}\\b', 'g')

const SECRET_ASSIGNMENT = py(SECRET_ASSIGNMENT_SOURCE, 'i')
const SECRET_ASSIGNMENT_ALL = py(SECRET_ASSIGNMENT_SOURCE, 'gi')
const TOKEN_SHAPES = py(TOKEN_SHAPES_SOURCE)
const TOKEN_SHAPES_ALL = py(TOKEN_SHAPES_SOURCE, 'g')

const isUpper = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase()
const isLower = (c: string) => c !== c.toUpperCase() && c === c.toLowerCase()
const isDigit = (c: string) => /^\p{Nd}$/u.test(c)

/** The check digit every payment card carries. An order number almost never passes it. */
function luhn(digits: string): boolean {
  let total = 0
  let alternate = false
  for (const char of [...digits].reverse()) {
    let value = char.codePointAt(0)! - 48
    if (alternate) {
      value *= 2
      if (value > 9) value -= 9
    }
    total += value
    alternate = !alternate
  }
  return total % 10 === 0
}

function maskCard(match: string): string {
  const digits = match.replace(/\P{Nd}/gu, '')
  const n = [...digits].length
  return n >= 13 && n <= 19 && luhn(digits) ? '[card]' : match
}

function maskCredential(run: string): string {
  const chars = [...run]
  return chars.some(isUpper) && chars.some(isLower) && chars.some(isDigit) ? '[secret]' : run
}

/** Fold look-alike and invisible characters so a gate cannot be dodged with Unicode. */
export function normalize(text: string): string {
  let out = ''
  for (const char of text.normalize('NFKC')) {
    if (char === '\n' || char === '\t' || !/^[\p{Cf}\p{Cc}]$/u.test(char)) out += char
  }
  return out
}

// A pasted key with no label and no vendor prefix (a self-hosted gateway's bearer, a
// `secrets.token_urlsafe` value) matched none of the rules above: redact() masked it, but
// isSensitive() said the text was fine to send. The bar here is the shape of a random
// token: no "/", enough of every class, and near-random spread. Measured on 2,000 seeded
// random base64url tokens per length: this catches 99.5% at 43 characters and 94% at 32.
// Readable names sit at 4.0-4.5 bits per character, and the ones that clear that are built
// from words: their runs of one character class average 2.7-3.4, a random token's ~1.6.
const UNLABELLED = py('(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+_-]{32,}={0,2}(?![A-Za-z0-9+/=_-])', 'g')
const MIN_BITS_PER_CHAR = 4.3
const MAX_MEAN_RUN = 2.4

function bitsPerChar(run: string[]): number {
  const counts = new Map<string, number>()
  for (const char of run) counts.set(char, (counts.get(char) ?? 0) + 1)
  let bits = 0
  for (const n of counts.values()) bits -= (n / run.length) * Math.log2(n / run.length)
  return bits
}

function charClass(char: string): number {
  return isUpper(char) ? 0 : isLower(char) ? 1 : isDigit(char) ? 2 : 3
}

/** Average length of the stretches of one character class: words are long, noise is short. */
function meanRun(run: string[]): number {
  let changes = 0
  for (let i = 1; i < run.length; i++) if (charClass(run[i - 1]) !== charClass(run[i])) changes++
  return run.length / (changes + 1)
}

function randomToken(match: string): boolean {
  const run = [...match]
  const digits = run.filter(isDigit).length
  const upper = run.filter(isUpper).length
  const lower = run.filter(isLower).length
  return digits >= 2 && upper >= 4 && lower >= 4 && meanRun(run) <= MAX_MEAN_RUN
    && bitsPerChar(run) >= MIN_BITS_PER_CHAR
}

export function isSensitive(text: string): boolean {
  const probe = normalize(text)
  return SECRET_WORDS.test(probe) || SECRET_NAME.test(probe) || SECRET_ASSIGNMENT.test(probe)
    || TOKEN_SHAPES.test(probe) || [...probe.matchAll(UNLABELLED)].some(m => randomToken(m[0]))
}

export function redact(text: string, limit = 4000): string {
  let out = normalize(text)
  // Hold tracking numbers aside so the phone rule cannot reach their digits, then put them
  // back before any truncation can cut a placeholder in half. normalize() removed every \0,
  // so the placeholders cannot collide with the text.
  const held: string[] = []
  out = out.replace(TRACKING, m => { held.push(m); return `\0TRK${held.length - 1}\0` })
  out = out.replace(TOKEN_SHAPES_ALL, '[secret]')
  // Keep the variable's NAME (it is often the useful signal) and mask only its value.
  out = out.replace(SECRET_ASSIGNMENT_ALL, m => m.split(/[:=]/)[0].trimEnd() + '=[secret]')
  out = out.replace(LONG_HEX, '[hex]')
  // After [hex], so a digest stays a digest, and before the phone rules, so a spaced card
  // number is not shredded into a "phone" and a remainder.
  out = out.replace(HIGH_ENTROPY, maskCredential)
  out = out.replace(CARD, maskCard)
  out = out.replace(EMAIL, '[email]')
  out = out.replace(PHONE, '[phone]')
  out = out.replace(INTL_PHONE, '[phone]')
  held.forEach((value, index) => { out = out.split(`\0TRK${index}\0`).join(value) })
  const points = [...out]
  if (points.length > limit) {
    const half = Math.floor(Math.max(limit, 0) / 2)
    // A cap of 0 or 1 keeps no tail rather than the whole text.
    out = points.slice(0, half).join('') + '\n[…]\n' + (half ? points.slice(-half).join('') : '')
  }
  return out
}
