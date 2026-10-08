// Python's `re`, as far as the ported engine needs it.
//
// Patterns are copied from jev-skills exactly as Python wrote them (the parity tests check
// the copies character for character) and compiled here into a JavaScript RegExp that
// matches the same things:
//
//   (?i) (?m) (?s) leading flags   -> taken out; `i` passed on, `m` and `s` applied below
//   (?P<name>...)                  -> (?<name>...)
//   \d \D                          -> Unicode decimal digits (\p{Nd}), as Python's
//   \w \W                          -> [\p{L}\p{N}_], exactly Python's word characters
//   \s \S                          -> Python's whitespace set (str.isspace), which differs
//                                     from JavaScript's at \x1c-\x1f, \x85 and \ufeff
//   \b \B                          -> word boundaries on that \w
//   \A \Z                          -> start and end of the text
//   ^ $ .                          -> Python's: `$` also matches before a final newline, and
//                                     with (?m) only \n ends a line (JavaScript adds \r, \u2028)
//   an escaped character JavaScript's `u` mode rejects (\" \' \` \: ...) -> the character
//
// Offsets differ too: Python counts code points and a RegExp counts UTF-16 units. `Text`
// below converts between them, so windows such as "90 characters before" mean what they did.

const WS = '\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const W = '\\p{L}\\p{N}_'
const BOUNDARY = `(?:(?<=[${W}])(?![${W}])|(?<![${W}])(?=[${W}]))`
const NOT_BOUNDARY = `(?:(?<=[${W}])(?=[${W}])|(?<![${W}])(?![${W}]))`
const SYNTAX = new Set([...'^$\\.*+?()[]{}|/-'])

/** Compile Python regex source. `flags` may add Python's i/m/s and JavaScript's g/y. */
export function py(source: string, extraFlags = ''): RegExp {
  let rest = source
  let flags = extraFlags
  const lead = /^\(\?([aiLmsux]+)\)/.exec(rest)
  if (lead) {
    flags += lead[1]
    rest = rest.slice(lead[0].length)
  }
  const multiline = flags.includes('m')
  const dotall = flags.includes('s')
  let out = ''
  let inClass = false
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i]
    if (c === '\\') {
      const e = rest[++i]
      if (inClass) {
        if (e === 'd') out += '\\p{Nd}'
        else if (e === 'w') out += W
        else if (e === 's') out += WS
        else if (e === 'D' || e === 'W' || e === 'S') throw new Error(`py: \\${e} inside a class is not supported`)
        else out += escaped(e!)
      } else if (e === 'b') out += BOUNDARY
      else if (e === 'B') out += NOT_BOUNDARY
      else if (e === 'd') out += '\\p{Nd}'
      else if (e === 'D') out += '\\P{Nd}'
      else if (e === 'w') out += `[${W}]`
      else if (e === 'W') out += `[^${W}]`
      else if (e === 's') out += `[${WS}]`
      else if (e === 'S') out += `[^${WS}]`
      else if (e === 'A') out += '(?<![\\s\\S])'
      else if (e === 'Z') out += '(?![\\s\\S])'
      else out += escaped(e!)
      continue
    }
    if (inClass) {
      if (c === ']') inClass = false
      out += c === '[' ? '\\[' : c
      continue
    }
    if (c === '[') {
      inClass = true
      out += '['
      if (rest[i + 1] === '^') { out += '^'; i++ }
      // Python reads a "]" first in a class as a literal.
      if (rest[i + 1] === ']') { out += '\\]'; i++ }
    } else if (c === '(' && rest.startsWith('(?P<', i)) {
      out += '(?<'
      i += 3
    } else if (c === '^') {
      out += multiline ? '(?:(?<![\\s\\S])|(?<=\\n))' : '(?<![\\s\\S])'
    } else if (c === '$') {
      out += multiline ? '(?=\\n|(?![\\s\\S]))' : '(?=\\n?(?![\\s\\S]))'
    } else if (c === '.') {
      out += dotall ? '[\\s\\S]' : '[^\\n]'
    } else {
      out += c
    }
  }
  return new RegExp(out, 'u' + [...'igy'].filter(f => flags.includes(f)).join(''))
}

function escaped(e: string): string {
  if (/[A-Za-z0-9]/.test(e) || SYNTAX.has(e)) return '\\' + e
  return e
}

/** Python's `pattern.search(text)`: the first match, or null. */
export function search(re: RegExp, text: string): RegExpExecArray | null {
  re.lastIndex = 0
  return re.exec(text)
}

const sticky = new WeakMap<RegExp, RegExp>()
const global = new WeakMap<RegExp, RegExp>()

/** Python's `pattern.match(text)`: a match that starts at the beginning, or null. */
export function matchStart(re: RegExp, text: string): RegExpExecArray | null {
  let y = sticky.get(re)
  if (!y) sticky.set(re, (y = new RegExp(re.source, re.flags + 'y')))
  y.lastIndex = 0
  return y.exec(text)
}

/** Python's `pattern.finditer(text)`. */
export function finditer(re: RegExp, text: string): IterableIterator<RegExpExecArray> {
  let g = global.get(re)
  if (!g) global.set(re, (g = new RegExp(re.source, re.flags + 'g')))
  return text.matchAll(g) as IterableIterator<RegExpExecArray>
}

/** Python's `pattern.sub(repl, text)`. */
export function sub(re: RegExp, repl: string | ((m: string) => string), text: string): string {
  let g = global.get(re)
  if (!g) global.set(re, (g = new RegExp(re.source, re.flags + 'g')))
  return typeof repl === 'string' ? text.replace(g, () => repl) : text.replace(g, m => repl(m))
}

/** Python's str.isspace, character by character. */
const SPACE = new RegExp(`^[${WS}]$`, 'u')
export const isSpace = (c: string) => SPACE.test(c)

/** Python's str.strip() with no argument. */
export function strip(text: string): string {
  return text.replace(new RegExp(`^[${WS}]+|[${WS}]+$`, 'gu'), '')
}

/**
 * A string indexed in code points, as Python indexes it. Without astral characters a code
 * point is one UTF-16 unit and every conversion is the identity.
 */
export class Text {
  readonly length: number
  private readonly units: number[] | null // code point index -> UTF-16 index
  private readonly points: Int32Array | null // UTF-16 index -> code point index

  constructor(readonly s: string) {
    if (!/[\uD800-\uDFFF]/.test(s)) {
      this.length = s.length
      this.units = null
      this.points = null
      return
    }
    const units: number[] = []
    const points = new Int32Array(s.length + 1)
    let u = 0
    for (const char of s) {
      points[u] = units.length
      if (char.length === 2) points[u + 1] = units.length
      units.push(u)
      u += char.length
    }
    points[s.length] = units.length
    units.push(s.length)
    this.units = units
    this.points = points
    this.length = units.length - 1
  }

  /** The code point offset of a UTF-16 offset (a RegExp's `index`). */
  cp(unit: number): number {
    return this.points ? this.points[unit]! : unit
  }

  /** The UTF-16 offset of a code point offset, clamped as a Python slice clamps. */
  unit(cp: number): number {
    const at = Math.max(0, Math.min(cp, this.length))
    return this.units ? this.units[at]! : at
  }

  /** Python's text[start:end] for start, end >= 0. */
  slice(start: number, end = this.length): string {
    return this.s.slice(this.unit(start), this.unit(end))
  }

  /** Python's text.find(needle, start), in code points. */
  find(needle: string, start: number): number {
    const at = this.s.indexOf(needle, this.unit(start))
    return at === -1 ? -1 : this.cp(at)
  }
}

/** Python's `pattern.fullmatch(text)`: the whole text, with no allowance for a final newline. */
export function fullmatch(re: RegExp, text: string): boolean {
  const m = matchStart(re, text)
  return m !== null && m[0].length === text.length
}

const NOT_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u

/** Python's repr() of a string, as its error messages quote one. */
export function repr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'"
  let out = quote
  for (const c of s) {
    if (c === '\\') out += '\\\\'
    else if (c === quote) out += '\\' + c
    else if (c === '\n') out += '\\n'
    else if (c === '\r') out += '\\r'
    else if (c === '\t') out += '\\t'
    else if (c !== ' ' && NOT_PRINTABLE.test(c)) {
      const cp = c.codePointAt(0)!
      out += cp < 0x100 ? '\\x' + cp.toString(16).padStart(2, '0')
        : cp < 0x10000 ? '\\u' + cp.toString(16).padStart(4, '0') : '\\U' + cp.toString(16).padStart(8, '0')
    } else out += c
  }
  return out + quote
}

/** Python's str.splitlines(). */
export function splitlines(text: string): string[] {
  const lines = text.split(/\r\n|[\n\r\x0b\x0c\x1c\x1d\x1e\x85\u2028\u2029]/)
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Python's float(text), or null where it raises ValueError. */
export function pyFloat(text: string): number | null {
  const s = strip(text).replace(/(?<=\d)_(?=\d)/g, '')
  if (/^[+-]?(?:inf|infinity)$/i.test(s)) return s.startsWith('-') ? -Infinity : Infinity
  if (/^[+-]?nan$/i.test(s)) return NaN
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)) return null
  return Number(s)
}

export type SplitURL = {
  scheme: string; netloc: string; path: string; query: string; fragment: string
  hostname: string | null; username: string | null; password: string | null
  /** Python's .port: null when absent; throws where Python raises ValueError. */
  port(): number | null
}

/** urllib.parse.urlsplit, including what it quietly drops (leading controls, \t \r \n). */
export function urlsplit(input: string): SplitURL {
  let url = input.replace(/^[\x00-\x20]+/, '').replace(/[\t\r\n]/g, '')
  let scheme = ''
  let netloc = ''
  let query = ''
  let fragment = ''
  const colon = url.indexOf(':')
  if (colon > 0 && /^[A-Za-z]$/.test(url[0]!) && /^[A-Za-z0-9+\-.]+$/.test(url.slice(0, colon))) {
    scheme = url.slice(0, colon).toLowerCase()
    url = url.slice(colon + 1)
  }
  if (url.startsWith('//')) {
    let end = url.length
    for (const c of '/?#') {
      const at = url.indexOf(c, 2)
      if (at >= 0) end = Math.min(end, at)
    }
    netloc = url.slice(2, end)
    url = url.slice(end)
    if (netloc.includes('[') !== netloc.includes(']')) throw new Error('Invalid IPv6 URL')
  }
  const hash = url.indexOf('#')
  if (hash >= 0) { fragment = url.slice(hash + 1); url = url.slice(0, hash) }
  const q = url.indexOf('?')
  if (q >= 0) { query = url.slice(q + 1); url = url.slice(0, q) }
  const at = netloc.lastIndexOf('@')
  const userinfo = at >= 0 ? netloc.slice(0, at) : null
  const hostinfo = at >= 0 ? netloc.slice(at + 1) : netloc
  let host: string
  let portText: string
  if (hostinfo.startsWith('[')) {
    const close = hostinfo.indexOf(']')
    host = hostinfo.slice(1, close)
    const after = hostinfo.slice(close + 1)
    portText = after.startsWith(':') ? after.slice(1) : ''
  } else {
    const c = hostinfo.indexOf(':')
    host = c >= 0 ? hostinfo.slice(0, c) : hostinfo
    portText = c >= 0 ? hostinfo.slice(c + 1) : ''
  }
  let username: string | null = null
  let password: string | null = null
  if (userinfo !== null) {
    const c = userinfo.indexOf(':')
    username = c >= 0 ? userinfo.slice(0, c) : userinfo
    password = c >= 0 ? userinfo.slice(c + 1) : null
  }
  return {
    scheme, netloc, path: url, query, fragment, username, password,
    hostname: host ? host.toLowerCase() : null,
    port() {
      if (!portText) return null
      if (!/^[0-9]+$/.test(portText)) throw new Error(`Port could not be cast to integer value as ${repr(portText)}`)
      const n = Number(portText)
      if (n > 65535) throw new Error('Port out of range 0-65535')
      return n
    },
  }
}

/**
 * Python's round(x, digits): the nearest decimal to the exact binary value, an exact tie to
 * even. JavaScript's toFixed breaks the same tie upwards (0.0625 is 0.063 there, 0.062 here).
 */
export function pyRound(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x
  // An exact tie at `digits` places is an odd multiple of 2^-(digits+1): (2n+1)/(2*10^d) is a
  // binary fraction only when 5^d divides the numerator. Scaling by a power of two is exact,
  // so this asks about the value itself, not a rounded product.
  if (Number.isInteger(x * 2 ** (digits + 1)) && !Number.isInteger(x * 2 ** digits)) {
    const scaled = x * 10 ** digits
    const down = Math.floor(scaled)
    return (down % 2 === 0 ? down : down + 1) / 10 ** digits
  }
  return Number(x.toFixed(digits))
}
