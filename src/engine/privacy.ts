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
//
// Where this deliberately differs from privacy.py (leaks the Unicode fixtures exposed), the
// rule says so, and test/parity/divergences.ts records each changed answer with its reason.

const WORD = '[\\p{L}\\p{N}_]'
// Secret patterns start and end at an ASCII boundary, not Python's Unicode \b: with \b an
// accented letter in front glued the secret to it ("naïveSECRET_KEY=…", "éAKIA…"), there was
// no boundary, and the value went out unmasked. Divergence from privacy.py.
const START = '(?<![A-Za-z0-9_])'
const END = '(?![A-Za-z0-9_])'

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
  `${START}cvv${END}|${START}ssn${END}|private[_ -]?key|BEGIN [A-Z ]*PRIVATE KEY`, 'i')
// An env-var name is how a secret usually appears in agent output: AWS_SECRET_ACCESS_KEY,
// STRIPE_SECRET, DB_PASSWORD, GITHUB_TOKEN. Matching only `secret_key` missed every one of
// them, because the revealing word sits in the middle of the name, not at its end.
const SECRET_ASSIGNMENT_SOURCE =
  `${START}[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*[_-]` +
  `(?:SECRET|SECRET[_-]?\\w*KEY|API[_-]?KEY|KEY|TOKEN|PASSWORD|PASSWD|CREDENTIALS?|AUTH)${END}` +
  '\\s*[:=]\\s*\\S*'
const SECRET_NAME = py(`${START}secret[_ -](?:access[_ -])?key${END}|${START}secret[_ -]?key${END}`, 'i')
const TOKEN_SHAPES_SOURCE =
  `${START}(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|` +
  `AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|apikey_[A-Za-z0-9_]{20,}|` +
  `eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{5,})${END}`
// Letters beyond ASCII on both sides of the @: privacy.py's ASCII-only local part let
// "josé@example.com" and "Zoë.Smith@exämple.com" out whole. Divergence from privacy.py.
const EMAIL = py('\\b[\\p{L}\\p{N}._%+-]+@[\\p{L}\\p{N}.-]+\\.\\p{L}{2,}\\b', 'g')
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
const LONG_HEX = py(`${START}[a-fA-F0-9]{32,}${END}`, 'g')

const SECRET_ASSIGNMENT = py(SECRET_ASSIGNMENT_SOURCE, 'i')
const SECRET_ASSIGNMENT_ALL = py(SECRET_ASSIGNMENT_SOURCE, 'gi')
const TOKEN_SHAPES = py(TOKEN_SHAPES_SOURCE)
const TOKEN_SHAPES_ALL = py(TOKEN_SHAPES_SOURCE, 'g')

const isUpper = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase()
const isLower = (c: string) => c !== c.toUpperCase() && c === c.toLowerCase()
const isDigit = (c: string) => /^\p{Nd}$/u.test(c)

/**
 * A decimal digit's value in any script. Each script's digits are ten consecutive code points
 * from its zero, so the value is how far back the run of digits goes, modulo ten (some
 * scripts' runs sit back to back). privacy.py took code point - 48, right for ASCII only, so
 * a card in Arabic-Indic digits never passed Luhn and went out whole. Divergence.
 */
function digitValue(char: string): number {
  let cp = char.codePointAt(0)!
  if (cp >= 48 && cp <= 57) return cp - 48
  let steps = 0
  while (steps < 40 && isDigit(String.fromCodePoint(cp - 1))) { cp--; steps++ }
  return steps % 10
}

/** The check digit every payment card carries. An order number almost never passes it. */
function luhn(digits: string): boolean {
  let total = 0
  let alternate = false
  for (const char of [...digits].reverse()) {
    let value = digitValue(char)
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

// Letters that look like Latin ones but are not, which NFKC leaves alone: "раssword" with a
// Cyrillic р and а passed every keyword rule. Divergence from privacy.py.
const CONFUSABLE: Record<string, string> = {
  'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x',
  'ѕ': 's', 'і': 'i', 'ј': 'j', 'ԁ': 'd', 'һ': 'h', 'ӏ': 'l', 'ԛ': 'q', 'ԝ': 'w', 'ү': 'y', 'ɡ': 'g',
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X',
  'Ѕ': 'S', 'І': 'I', 'Ј': 'J', 'Ү': 'Y', 'Ԁ': 'D', 'Ԛ': 'Q', 'Ԝ': 'W',
  'α': 'a', 'ο': 'o', 'ρ': 'p', 'ν': 'v', 'ι': 'i', 'κ': 'k', 'τ': 't', 'υ': 'u', 'χ': 'x',
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P',
  'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
}
const WORDS = /[\p{L}\p{N}_]+/gu
const ASCII_LETTER = /[A-Za-z]/

// A secret's name on its own, for telling a disguised name from an ordinary word.
const KEY_NAME = py(
  '^[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+)*[_-](?:SECRET|SECRET[_-]?\\w*KEY|API[_-]?KEY|KEY|TOKEN|PASSWORD|PASSWD|CREDENTIALS?|AUTH)$',
  'i')

/**
 * Fold look-alikes to Latin, but only inside a word that is a disguise: one that mixes them
 * with ASCII letters ("раssword"), or is built from look-alikes alone and folds to a secret's
 * keyword or name ("АРІ_КЕҮ"). Ordinary Russian or Greek text is untouched, including short
 * words made only of look-alikes ("ο", "του", "сор").
 */
export function foldConfusables(text: string): string {
  return text.replace(WORDS, word => {
    const letters = [...word].filter(c => /\p{L}/u.test(c))
    if (!letters.some(c => c in CONFUSABLE)) return word
    const folded = [...word].map(c => CONFUSABLE[c] ?? c).join('')
    if (letters.some(c => ASCII_LETTER.test(c))) return folded
    const disguise = letters.every(c => c in CONFUSABLE)
      && (SECRET_WORDS.test(folded) || SECRET_NAME.test(folded) || KEY_NAME.test(folded))
    return disguise ? folded : word
  })
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
  const probe = foldConfusables(normalize(text))
  return SECRET_WORDS.test(probe) || SECRET_NAME.test(probe) || SECRET_ASSIGNMENT.test(probe)
    || TOKEN_SHAPES.test(probe) || [...probe.matchAll(UNLABELLED)].some(m => randomToken(m[0]))
}

export function redact(text: string, limit = 4000): string {
  let out = foldConfusables(normalize(text))
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
