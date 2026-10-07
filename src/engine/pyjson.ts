// Python's `json.loads` and `json.dumps(value, indent=2, ensure_ascii=False)`, for rewriting a
// tool result the way jev-skills' webscreen.py did. JSON.parse and JSON.stringify differ from
// them where it shows in the rewritten text: key order (JavaScript moves integer-like keys
// first), integers beyond 2^53, floats ("1.0", "1e-05", "1e+16" in Python), and NaN/Infinity,
// which Python reads and writes.
//
// The value model: an object is a Map (insertion order, a repeated key keeps its first place
// and takes the last value, as a dict does), an array is an array, an integer is a bigint, a
// float is a PyFloat, and strings, booleans and null are themselves.

export class PyFloat {
  constructor(readonly value: number) {}
}

export type PyValue = null | boolean | string | bigint | PyFloat | PyValue[] | Map<string, PyValue>

export class PyJSONError extends Error {}

const NUMBER = /-?(?:0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?/y
const SPACE = /[ \t\n\r]*/y

/** json.loads: throws PyJSONError where Python raises. */
export function loads(text: string): PyValue {
  if (text.startsWith('﻿')) throw new PyJSONError('Unexpected UTF-8 BOM')
  let at = 0
  const skip = () => { SPACE.lastIndex = at; SPACE.exec(text); at = SPACE.lastIndex }
  const fail = (what: string): never => { throw new PyJSONError(`${what} at ${at}`) }

  function string(): string {
    at++ // the opening quote
    let out = ''
    for (;;) {
      if (at >= text.length) fail('Unterminated string')
      const c = text[at]
      if (c === '"') { at++; return out }
      if (c === '\\') {
        const e = text[at + 1]
        const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
        if (e in simple) { out += simple[e]; at += 2; continue }
        if (e !== 'u') fail('Invalid \\escape')
        const hex = text.slice(at + 2, at + 6)
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Invalid \\uXXXX escape')
        let code = parseInt(hex, 16)
        at += 6
        // A high surrogate followed by an escaped low one is one character, as in Python.
        if (code >= 0xd800 && code <= 0xdbff && text.startsWith('\\u', at)) {
          const low = text.slice(at + 2, at + 6)
          const next = /^[0-9a-fA-F]{4}$/.test(low) ? parseInt(low, 16) : -1
          if (next >= 0xdc00 && next <= 0xdfff) {
            code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
            at += 6
          }
        }
        out += String.fromCodePoint(code)
        continue
      }
      if (c < ' ') fail('Invalid control character')
      out += c
      at++
    }
  }

  function value(): PyValue {
    skip()
    const c = text[at]
    if (c === '"') return string()
    if (c === '{') {
      at++
      const out = new Map<string, PyValue>()
      skip()
      if (text[at] === '}') { at++; return out }
      for (;;) {
        skip()
        if (text[at] !== '"') fail('Expecting property name enclosed in double quotes')
        const key = string()
        skip()
        if (text[at] !== ':') fail("Expecting ':' delimiter")
        at++
        out.set(key, value())
        skip()
        if (text[at] === '}') { at++; return out }
        if (text[at] !== ',') fail("Expecting ',' delimiter")
        at++
      }
    }
    if (c === '[') {
      at++
      const out: PyValue[] = []
      skip()
      if (text[at] === ']') { at++; return out }
      for (;;) {
        out.push(value())
        skip()
        if (text[at] === ']') { at++; return out }
        if (text[at] !== ',') fail("Expecting ',' delimiter")
        at++
      }
    }
    for (const [word, result] of [['null', null], ['true', true], ['false', false], ['NaN', new PyFloat(NaN)],
      ['Infinity', new PyFloat(Infinity)], ['-Infinity', new PyFloat(-Infinity)]] as const) {
      if (text.startsWith(word, at)) { at += word.length; return result }
    }
    NUMBER.lastIndex = at
    const m = NUMBER.exec(text)
    if (!m) return fail('Expecting value')
    at = NUMBER.lastIndex
    return m[1] || m[2] ? new PyFloat(Number(m[0])) : BigInt(m[0])
  }

  const out = value()
  skip()
  if (at !== text.length) fail('Extra data')
  return out
}

/** Python's repr of a float, which json.dumps writes. */
export function floatRepr(x: number): string {
  if (Number.isNaN(x)) return 'NaN'
  if (x === Infinity) return 'Infinity'
  if (x === -Infinity) return '-Infinity'
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0'
  const sign = x < 0 ? '-' : ''
  // toExponential() with no argument gives the shortest digits that round-trip, as repr does.
  const [mantissa, exp] = Math.abs(x).toExponential().split('e')
  const digits = mantissa.replace('.', '')
  const n = Number(exp)
  if (n < -4 || n >= 16) {
    const body = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits
    return `${sign}${body}e${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}`
  }
  if (n < 0) return `${sign}0.${'0'.repeat(-n - 1)}${digits}`
  const whole = digits.slice(0, n + 1).padEnd(n + 1, '0')
  const frac = digits.slice(n + 1) || '0'
  return `${sign}${whole}.${frac}`
}

const NAMED: Record<string, string> = { '\\': '\\\\', '"': '\\"', '\b': '\\b', '\f': '\\f', '\n': '\\n', '\r': '\\r', '\t': '\\t' }

function quote(s: string): string {
  return '"' + s.replace(/[\x00-\x1f\\"]/g, c => NAMED[c] ?? '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '"'
}

/** json.dumps(value, indent=2, ensure_ascii=False). */
export function dumps(value: PyValue, indent = 2, level = 0): string {
  if (value === null) return 'null'
  if (value === true) return 'true'
  if (value === false) return 'false'
  if (typeof value === 'string') return quote(value)
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof PyFloat) return floatRepr(value.value)
  const inner = ' '.repeat(indent * (level + 1))
  const outer = ' '.repeat(indent * level)
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return '[\n' + value.map(v => inner + dumps(v, indent, level + 1)).join(',\n') + '\n' + outer + ']'
  }
  if (!value.size) return '{}'
  return '{\n' + [...value].map(([k, v]) => `${inner}${quote(k)}: ${dumps(v, indent, level + 1)}`).join(',\n')
    + '\n' + outer + '}'
}

/** Python's truth value of a JSON value. */
export function truthy(value: PyValue | undefined): boolean {
  if (value === null || value === undefined || value === false || value === '') return false
  if (typeof value === 'bigint') return value !== 0n
  if (value instanceof PyFloat) return value.value !== 0
  if (Array.isArray(value)) return value.length > 0
  if (value instanceof Map) return value.size > 0
  return true
}
