// A decision policy, as data: the questions to ask the decision model, and the rules that turn
// its answers into an action.
//
// Ported from jev-skills' jevkit/policy.py, as far as running one policy needs: loading and
// checking it (lint), reducing answers to readings, the rules and pre-rules, and drift. Its
// locating and listing are the feature's (it reads the files), and explain/describe/bind are
// tooling the mod has no use for.
//
// Readings come from the model; actions come from code. A policy file holds no expressions:
// a rule is [operand, op, value...] or {"all"|"any": [...]}, checked in order, first match wins.

import { checkQuestion, type Answer } from './client'
import { floatRepr, loads, PyFloat, toPlain, type PyValue } from './pyjson'
import { py, pyRound, repr as strRepr } from './pyre'

export const NUMERIC_OPS = ['>=', '>', '<=', '<']
export const OPS = [...NUMERIC_OPS, '==', '!=', 'in', 'not_in', 'between']
export const DEFAULT_BAND: [number, number] = [0.3, 0.7]
const NAME = py('^[a-z0-9][a-z0-9_.-]{0,63}$')
const FACT = py('^fact\\.[a-z0-9_]{1,64}$')
// Keys a policy may carry; a misspelt "otherwize" must not silently leave the fallback at its default.
const KNOWN_KEYS = new Set([
  'name', 'version', 'feature', 'tuned_on', 'description', 'questions', 'rules', 'otherwise',
  'on_error', 'on_drift', 'uncertain_band', 'annotations', 'promotion', 'state_fields',
  'field_limits', 'trusted_instruction_fields', 'code_first', 'precedence', 'actions',
  'dynamic_choices', '_note', 'source', 'pre_rules',
])
const BUILT_IN_PROVIDERS = ['typesafe', 'openrouter', 'venice', 'zen', 'custom']

export class PolicyError extends Error {}

export type Condition = unknown[] | { all?: Condition[]; any?: Condition[] }
export type Rule = { then: string; all?: Condition[]; any?: Condition[] }
export type Policy = {
  name: string; version: number; feature?: string; tuned_on?: string
  questions: Record<string, { type: string; instructions: unknown; criteria?: unknown }>
  rules: Rule[]; pre_rules?: Rule[]; annotations?: (Rule & { add: string })[]
  otherwise: string; on_error: string; on_drift?: string
  uncertain_band?: [number, number]; state_fields?: string[]; field_limits?: Record<string, number>
  /** Where it was read from: shipped, override, backend or file. */
  _origin?: string
  [key: string]: unknown
}

// ── Python's values, as lint reads and quotes them ───────────────────────────

const isMap = (v: PyValue | undefined): v is Map<string, PyValue> => v instanceof Map
const isList = (v: PyValue | undefined): v is PyValue[] => Array.isArray(v)
const isStr = (v: PyValue | undefined): v is string => typeof v === 'string'
/** int or float, never bool (isinstance(v, (int, float)) and not isinstance(v, bool)). */
const isNum = (v: PyValue | undefined): boolean => typeof v === 'bigint' || v instanceof PyFloat
const num = (v: PyValue | undefined): number => (typeof v === 'bigint' ? Number(v) : v instanceof PyFloat ? v.value : NaN)
const get = (m: PyValue | undefined, key: string): PyValue | undefined => (isMap(m) ? m.get(key) : undefined)
const truthy = (v: PyValue | undefined) => !(v === undefined || v === null || v === false || v === '' || (isNum(v) && num(v) === 0)
  || (isList(v) && !v.length) || (isMap(v) && !v.size))

/** Python's repr() of a parsed JSON value. */
export function pyRepr(v: PyValue | undefined): string {
  if (v === undefined || v === null) return 'None'
  if (v === true) return 'True'
  if (v === false) return 'False'
  if (typeof v === 'string') return strRepr(v)
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof PyFloat) {
    if (Number.isNaN(v.value)) return 'nan'
    if (!Number.isFinite(v.value)) return v.value > 0 ? 'inf' : '-inf'
    return floatRepr(v.value)
  }
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(', ')}]`
  return `{${[...v].map(([k, x]) => `${strRepr(k)}: ${pyRepr(x)}`).join(', ')}}`
}

/** Python's str(): repr except for a string, which is itself. */
const pyStr = (v: PyValue | undefined) => (typeof v === 'string' ? v : pyRepr(v))

/** Python's format(x, 'g') for the 0..top bound lint quotes. */
function formatG(x: number): string {
  if (Number.isInteger(x) && Math.abs(x) < 1e6) return String(x)
  return String(Number(x.toPrecision(6)))
}

/** Python's sorted() of strings: by code point. */
const sortedStrings = (xs: string[]) => [...xs].sort((a, b) => {
  const pa = Array.from(a, c => c.codePointAt(0)!), pb = Array.from(b, c => c.codePointAt(0)!)
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) if (pa[i] !== pb[i]) return pa[i]! - pb[i]!
  return pa.length - pb.length
})

// ── lint ─────────────────────────────────────────────────────────────────────

function operandProblem(operand: PyValue, questions: Map<string, PyValue>): string | null {
  if (!isStr(operand) || !operand) return `operand ${pyRepr(operand)} is not a string`
  if (operand.startsWith('fact.')) return FACT.test(operand) ? null : `operand ${pyRepr(operand)}: a fact is fact.<lowercase_key>`
  const dot = operand.indexOf('.')
  const name = dot < 0 ? operand : operand.slice(0, dot)
  const field = dot < 0 ? '' : operand.slice(dot + 1)
  const question = questions.get(name)
  if (!isMap(question)) return `operand ${pyRepr(operand)} names no question`
  const kind = question.get('type')
  if (field.startsWith('p.')) {
    const option = field.slice(2)
    if (kind === 'choice') {
      const criteria = question.get('criteria')
      if (criteria !== undefined && criteria !== null && !contains(criteria, option)) {
        return `operand ${pyRepr(operand)}: ${pyRepr(option)} is not an option of ${name}`
      }
      return null
    }
    if (kind === 'score') {
      const levels = lengthOf(question.get('criteria'))
      if (!/^\p{Nd}+$/u.test(option) || Number(option) >= levels) {
        return `operand ${pyRepr(operand)}: level ${pyRepr(option)} is not 0..${levels - 1}`
      }
      return null
    }
    return `operand ${pyRepr(operand)}: a noul has no .p.<option>`
  }
  const allowed: Record<string, string[]> = { noul: ['', 'unsure'], choice: ['choice', 'confidence', 'margin'], score: ['norm', 'score', 'confidence'] }
  const fields = typeof kind === 'string' ? (allowed[kind] ?? []) : []
  if (!fields.includes(field)) {
    const offered = `[${sortedStrings(fields.map(f => f || '(bare)')).map(strRepr).join(', ')}]`
    return `operand ${pyRepr(operand)}: a ${pyStr(kind)} offers ${offered}`
  }
  return null
}

/** Python's `x in container` for a criteria value: a dict's keys, a list's items, a substring. */
function contains(container: PyValue, x: string): boolean {
  if (isMap(container)) return container.has(x)
  if (isList(container)) return container.some(item => item === x)
  if (isStr(container)) return container.includes(x)
  return false
}

const lengthOf = (v: PyValue | undefined) => (isMap(v) ? v.size : isList(v) ? v.length : isStr(v) ? Array.from(v).length : 0)

function factProblems(op: string, args: PyValue[], where: string): string[] {
  if (op === 'between') {
    if (args.length !== 2 || !args.every(isNum)) return [`${where}: between takes two numbers`]
    return num(args[0]) <= num(args[1]) ? [] : [`${where}: between ${pyStr(args[0])} and ${pyStr(args[1])} is empty`]
  }
  if (args.length !== 1) return [`${where}: ${op} takes one value`]
  const value = args[0]
  if (op === 'in' || op === 'not_in') return isList(value) ? [] : [`${where}: ${op} takes a list`]
  if (NUMERIC_OPS.includes(op)) {
    if (!isNum(value) || !Number.isFinite(num(value))) return [`${where}: ${pyRepr(value)} is not a number`]
    return []
  }
  if (value !== null && !(isStr(value) || isNum(value) || typeof value === 'boolean')) {
    return [`${where}: ${op} compares a fact with one plain value`]
  }
  return []
}

function conditionProblems(condition: PyValue, questions: Map<string, PyValue>, where: string, factsOnly = false): string[] {
  if (isMap(condition)) {
    const keys = [...condition.keys()].filter(k => k === 'all' || k === 'any')
    if (keys.length !== 1 || condition.size !== 1) return [`${where}: a nested condition is {"all": [...]} or {"any": [...]}`]
    const items = condition.get(keys[0]!)
    if (!isList(items) || !items.length) return [`${where}: an empty all/any`]
    return items.flatMap((item, i) => conditionProblems(item, questions, `${where}.${i}`, factsOnly))
  }
  if (!isList(condition) || condition.length < 3) return [`${where}: a condition is [operand, op, value...]`]
  const [operand, op, ...args] = condition
  if (factsOnly && !(isStr(operand) && operand.startsWith('fact.'))) {
    return [`${where}: a pre-rule runs before Jev is asked, so it can only read fact.<key>, not ${pyRepr(operand)}`]
  }
  const problem = operandProblem(operand as PyValue, questions)
  if (problem) return [`${where}: ${problem}`]
  if (!isStr(op) || !OPS.includes(op)) return [`${where}: unknown op ${pyRepr(op)}; use one of ${OPS.join(', ')}`]
  const name = (operand as string)
  if (name.startsWith('fact.')) return factProblems(op, args, where)
  const dot = name.indexOf('.')
  const qname = dot < 0 ? name : name.slice(0, dot)
  const field = dot < 0 ? '' : name.slice(dot + 1)
  const question = questions.get(qname) as Map<string, PyValue>
  const kind = question.get('type')
  const categorical = kind === 'choice' && field === 'choice'
  const boolean = field === 'unsure'
  if (op === 'between') {
    if (args.length !== 2 || categorical || boolean) return [`${where}: between takes two numbers`]
  } else if (args.length !== 1) {
    return [`${where}: ${op} takes one value`]
  }
  if (categorical) {
    if (NUMERIC_OPS.includes(op) || op === 'between') return [`${where}: a choice label cannot be compared with ${op}`]
    const criteria = question.get('criteria')
    const options = isMap(criteria) ? [...criteria.keys()] : isList(criteria) ? criteria : []
    if ((op === 'in' || op === 'not_in') && !isList(args[0])) return [`${where}: ${op} takes a list of options`]
    const wanted = op === 'in' || op === 'not_in' ? (args[0] as PyValue[]) : [args[0]]
    const unknown = wanted.filter(w => options.length && !options.some(o => o === w))
    if (unknown.length) return [`${where}: ${pyRepr(unknown as PyValue[])} are not options of ${qname}`]
    return []
  }
  if (boolean) {
    if ((op !== '==' && op !== '!=') || typeof args[0] !== 'boolean') return [`${where}: .unsure is compared with == true or == false`]
    return []
  }
  if (op === 'in' || op === 'not_in') return [`${where}: ${op} is for choice labels`]
  const top = field === 'score' ? lengthOf(question.get('criteria')) - 1 : 1.0
  for (const value of args) {
    if (!isNum(value) || !Number.isFinite(num(value))) return [`${where}: ${pyRepr(value)} is not a number`]
    if (!(num(value) >= 0 && num(value) <= top)) {
      return [`${where}: ${pyRepr(value)} is outside 0..${formatG(top)}; thresholds sit on the 0..1 scale (use .norm for a score)`]
    }
  }
  if (op === 'between' && num(args[0]) > num(args[1])) return [`${where}: between ${pyStr(args[0])} and ${pyStr(args[1])} is empty`]
  return []
}

function ruleProblems(rule: PyValue, questions: Map<string, PyValue>, where: string, needsThen: boolean, factsOnly = false): string[] {
  if (!isMap(rule)) return [`${where}: a rule is an object`]
  const joiners = ['all', 'any'].filter(k => rule.has(k))
  if (joiners.length !== 1) return [`${where}: a rule has exactly one of "all" or "any"`]
  const problems: string[] = []
  const then = rule.get('then')
  if (needsThen && (!isStr(then) || !then)) problems.push(`${where}: no "then" action`)
  const items = rule.get(joiners[0]!)
  if (!isList(items) || !items.length) return [...problems, `${where}: an empty ${joiners[0]}`]
  items.forEach((item, i) => problems.push(...conditionProblems(item, questions, `${where}.${joiners[0]}.${i}`, factsOnly)))
  return problems
}

/** Every problem with a policy, so one run lists them all; [] for a sound one. */
export function lint(policy: PyValue): string[] {
  const problems: string[] = []
  if (!isMap(policy)) return ['a policy is one JSON object']
  const unknown = sortedStrings([...policy.keys()].filter(k => !KNOWN_KEYS.has(k) && !k.startsWith('_')))
  if (unknown.length) problems.push(`unknown keys [${unknown.map(strRepr).join(', ')}]`)
  const name = policy.get('name')
  if (!isStr(name) || !NAME.test(name)) problems.push('name must be lowercase letters, digits, - _ .')
  const version = policy.get('version')
  if (typeof version !== 'bigint' || version < 1n) problems.push('version must be a whole number from 1')
  const questions = policy.get('questions')
  if (!isMap(questions) || !questions.size) return [...problems, 'questions must be a non-empty object']
  if (questions.size > 32) problems.push('more than 32 questions in one request; split the policy')
  const dynamic = policy.get('dynamic_choices')
  for (const [qname, question] of questions) {
    if (isMap(dynamic) && dynamic.has(qname)) continue // bound at run time
    try {
      checkQuestion(qname, toPlain(question))
    } catch (error) {
      problems.push((error as Error).message)
    }
  }
  let rules = policy.get('rules')
  if (!isList(rules)) {
    problems.push('rules must be a list (it may be empty)')
    rules = []
  }
  const checkable = new Map([...questions].filter(([, v]) => isMap(v)))
  rules.forEach((rule, i) => problems.push(...ruleProblems(rule, checkable, `rule ${i}`, true)))
  let pre = policy.get('pre_rules')
  if (pre !== undefined && pre !== null && !isList(pre)) {
    problems.push('pre_rules must be a list')
    pre = []
  }
  const preRules = isList(pre) ? pre : []
  preRules.forEach((rule, i) => problems.push(...ruleProblems(rule, checkable, `pre-rule ${i}`, true, true)))
  const notes = policy.get('annotations')
  ;(isList(notes) ? notes : []).forEach((note, i) => {
    if (!isMap(note) || !isStr(note.get('add'))) {
      problems.push(`annotation ${i}: needs "add"`)
      return
    }
    problems.push(...ruleProblems(new Map([...note].filter(([k]) => k !== 'add')), checkable, `annotation ${i}`, false))
  })
  for (const key of ['otherwise', 'on_error']) {
    const value = policy.get(key)
    if (!isStr(value) || !value) problems.push(`${key} must name an action`)
  }
  if (policy.has('on_drift')) {
    const value = policy.get('on_drift')
    if (!isStr(value) || !value) problems.push('on_drift must name an action')
  }
  const band = policy.has('uncertain_band') ? policy.get('uncertain_band') : [new PyFloat(0.3), new PyFloat(0.7)]
  if (!isList(band) || band.length !== 2 || !band.every(isNum) || !(0 <= num(band[0]) && num(band[0]) < num(band[1]) && num(band[1]) <= 1)) {
    problems.push('uncertain_band must be [low, high] with 0 <= low < high <= 1')
  }
  const produced = rules.filter(isMap).map(rule => rule.get('then'))
  const preProduced = preRules.filter(isMap).map(rule => rule.get('then'))
  const declared = policy.get('actions')
  const everything: PyValue[] = []
  for (const action of [...produced, ...preProduced, policy.get('otherwise'), policy.get('on_error'), policy.get('on_drift')]) {
    if (truthy(action) && !everything.some(seen => same(seen, action))) everything.push(action as PyValue)
  }
  if (declared !== undefined && declared !== null) {
    if (!isList(declared) || !declared.every(isStr)) {
      problems.push('actions must be a list of names')
    } else {
      const missing = everything.filter(action => !declared.some(d => d === action))
      if (missing.length) problems.push(`actions ${pyRepr(sortedValues(missing))} are produced but not declared`)
    }
  }
  const precedence = policy.get('precedence')
  if (precedence !== undefined && precedence !== null) {
    const order: (PyValue | undefined)[] = []
    for (const action of produced) if (!order.some(seen => same(seen, action))) order.push(action)
    const listed = isList(precedence) ? precedence : isStr(precedence) ? Array.from(precedence) : isMap(precedence) ? [...precedence.keys()] : []
    if (listed.length !== order.length || listed.some((p, i) => !same(p, order[i]))) {
      problems.push(`precedence ${pyRepr(listed)} does not match the rule order ${pyRepr(order.map(o => (o === undefined ? null : o)))}; `
        + 'rules are checked in order and the first match wins')
    }
  }
  const fields = policy.get('state_fields')
  if (fields !== undefined && fields !== null && (!isList(fields) || !fields.every(isStr))) {
    problems.push('state_fields must be a list of field names')
  }
  const tuned = policy.get('tuned_on')
  // A Jev policy names the Jev version it was measured on; an alias that moves names nothing.
  if (tuned !== undefined && tuned !== null && (!isStr(tuned) || !tuned.trim() || tuned.toLowerCase().includes('latest')
      || (tuned.startsWith('jev') && !versionOf(tuned).length))) {
    problems.push('tuned_on must name the model it was measured on, like jev-1.13.0')
  }
  return problems
}

/** Python's == between two parsed values (1 == 1.0 == True). */
function same(a: PyValue | undefined, b: PyValue | undefined): boolean {
  const scalar = (v: PyValue | undefined) => (typeof v === 'boolean' ? Number(v) : isNum(v) ? num(v) : undefined)
  if (scalar(a) !== undefined && scalar(b) !== undefined) return scalar(a) === scalar(b)
  if (a === undefined || b === undefined) return a === b
  if (isList(a) && isList(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]))
  return a === b
}

/** sorted() of the produced-but-undeclared actions: strings by code point, numbers by value. */
function sortedValues(values: PyValue[]): PyValue[] {
  const strings = sortedStrings(values.filter(isStr) as string[])
  const numbers = values.filter(v => !isStr(v)).sort((a, b) => num(a) - num(b))
  return [...numbers, ...strings]
}

/** A policy from its JSON text, checked; PolicyError naming every problem. `origin` says where it came from. */
export function parse(text: string, fallbackName: string, origin: string): Policy {
  let raw: PyValue
  try {
    raw = loads(text)
  } catch (error) {
    throw new PolicyError(`${fallbackName}.json could not be read as JSON: ${(error as Error).message}`)
  }
  if (!isMap(raw)) throw new PolicyError(`${fallbackName}.json must hold one JSON object`)
  if (!raw.has('name')) raw.set('name', fallbackName)
  const problems = lint(raw)
  if (problems.length) throw new PolicyError(`policy ${pyRepr(raw.get('name'))}: ${problems.join('; ')}`)
  return { ...(toPlain(raw) as Policy), _origin: origin }
}

// ── reading answers ──────────────────────────────────────────────────────────

export type Reading =
  | { kind: 'noul'; p: number; unsure: boolean }
  | { kind: 'choice'; choice: string; confidence: number; margin: number; p: Record<string, number> }
  | { kind: 'score'; score: number; norm: number; confidence: number; p: Record<string, number> }

/** Top probability minus the runner-up: how clearly the pick beat the next option. */
export function margin(probabilities: Record<string, number>): number {
  const values = Object.values(probabilities).map(Number).sort((a, b) => b - a)
  if (!values.length) return 0.0
  return pyRound(values[0]! - (values.length > 1 ? values[1]! : 0.0), 6)
}

/** Every validated answer reduced to the numbers a rule can name. No text survives this. */
export function readings(questions: Policy['questions'], answers: Record<string, Answer | Record<string, unknown>>,
  band: [number, number] = DEFAULT_BAND): Record<string, Reading> {
  const [low, high] = band
  const out: Record<string, Reading> = {}
  for (const [name, question] of Object.entries(questions)) {
    const answer = answers[name] as Record<string, any>
    if (question.type === 'noul') {
      const p = Number(answer.noul)
      out[name] = { kind: 'noul', p: pyRound(p, 6), unsure: low <= p && p <= high }
    } else if (question.type === 'choice') {
      const probabilities = Object.fromEntries(Object.entries(answer.probabilities as Record<string, number>).map(([k, v]) => [k, Number(v)]))
      out[name] = { kind: 'choice', choice: answer.choice, confidence: pyRound(Number(answer.confidence), 6), margin: margin(probabilities),
        p: Object.fromEntries(Object.entries(probabilities).map(([k, v]) => [k, pyRound(v, 6)])) }
    } else {
      const levels = Array.isArray(question.criteria) ? question.criteria.length : Object.keys(question.criteria ?? {}).length
      const value = Number(answer.score)
      out[name] = { kind: 'score', score: pyRound(value, 6), norm: pyRound(Math.min(1.0, Math.max(0.0, value / (levels - 1))), 6),
        confidence: pyRound(Number(answer.confidence ?? 1.0), 6),
        p: Object.fromEntries(Object.entries(answer.probabilities ?? {}).map(([k, v]) => [String(k), pyRound(Number(v), 6)])) }
    }
  }
  return out
}

// ── rules ────────────────────────────────────────────────────────────────────

const MISSING = Symbol('missing')
export type Facts = Record<string, unknown>

/** The number, label or flag an operand names. A fact the caller did not supply never holds. */
export function operandValue(operand: string, values: Record<string, Reading>, facts?: Facts): unknown {
  if (operand.startsWith('fact.')) {
    const key = operand.slice(5)
    return facts && Object.prototype.hasOwnProperty.call(facts, key) ? facts[key] : MISSING
  }
  const dot = operand.indexOf('.')
  const name = dot < 0 ? operand : operand.slice(0, dot)
  const field = dot < 0 ? '' : operand.slice(dot + 1)
  const reading = values[name]
  if (!reading) throw new Error(`KeyError: ${operand}`)
  if (!field) {
    if (reading.kind !== 'noul') throw new Error(`KeyError: ${operand}`)
    return reading.p
  }
  if (field.startsWith('p.')) return (reading as { p: Record<string, number> }).p[field.slice(2)] ?? 0.0
  if (field === 'unsure' && reading.kind === 'noul') return reading.unsure
  if (['choice', 'confidence', 'margin'].includes(field) && reading.kind === 'choice') return reading[field as 'choice']
  if (['norm', 'score', 'confidence'].includes(field) && reading.kind === 'score') return reading[field as 'norm']
  throw new Error(`KeyError: ${operand}`)
}

/** Python's == between a value the caller or a reading gave and one a rule names. */
function pyEq(a: unknown, b: unknown): boolean {
  const scalar = (v: unknown) => (typeof v === 'boolean' ? Number(v) : typeof v === 'number' ? v : undefined)
  if (scalar(a) !== undefined && scalar(b) !== undefined) return scalar(a) === scalar(b)
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => pyEq(x, b[i]))
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b)
    return ka.length === kb.length && ka.every(k => k in (b as object) && pyEq((a as any)[k], (b as any)[k]))
  }
  return a === b
}

function compare(left: unknown, op: string, args: unknown[]): boolean {
  if (left === MISSING || left === null || left === undefined) return false
  // a value that is not a number never passes a numeric threshold
  if ([...NUMERIC_OPS, 'between'].includes(op) && typeof left !== 'number') return false
  if (op === 'between') return Number(args[0]) <= (left as number) && (left as number) <= Number(args[1])
  const right = args[0]
  if (op === 'in') return pyIn(left, right)
  if (op === 'not_in') return !pyIn(left, right)
  if (op === '==') return pyEq(left, right)
  if (op === '!=') return !pyEq(left, right)
  const l = left as number, r = Number(right)
  return op === '>=' ? l >= r : op === '>' ? l > r : op === '<=' ? l <= r : l < r
}

function pyIn(x: unknown, container: unknown): boolean {
  if (Array.isArray(container)) return container.some(item => pyEq(x, item))
  if (typeof container === 'string' && typeof x === 'string') return container.includes(x)
  if (container && typeof container === 'object') return typeof x === 'string' && x in container
  return false
}

export function holds(condition: Condition, values: Record<string, Reading>, facts?: Facts): boolean {
  if (!Array.isArray(condition)) {
    if (condition.all) return condition.all.every(item => holds(item, values, facts))
    return (condition.any ?? []).some(item => holds(item, values, facts))
  }
  const [operand, op, ...args] = condition
  return compare(operandValue(operand as string, values, facts), op as string, args)
}

export function ruleHolds(rule: { all?: Condition[]; any?: Condition[] }, values: Record<string, Reading>, facts?: Facts): boolean {
  if (rule.all) return rule.all.every(item => holds(item, values, facts))
  return (rule.any ?? []).some(item => holds(item, values, facts))
}

/** The code-first action, or null: ask the model. The first matching pre-rule wins. */
export function preDecide(policy: Policy, facts?: Facts): { action: string; matched_pre_rule: number } | null {
  if (!facts || !Object.keys(facts).length) return null
  for (const [index, rule] of (policy.pre_rules ?? []).entries()) {
    if (ruleHolds(rule, {}, facts)) return { action: rule.then, matched_pre_rule: index }
  }
  return null
}

export type Applied = { action: string; matched_rule: number | null; fired_rules: number[]; annotations: string[]; unsure: string[] }

/** The first matching rule wins; every rule that matched is reported too. */
export function apply(policy: Policy, values: Record<string, Reading>, facts?: Facts): Applied {
  const fired = policy.rules.flatMap((rule, i) => (ruleHolds(rule, values, facts) ? [i] : []))
  const action = fired.length ? policy.rules[fired[0]!]!.then : policy.otherwise
  const annotations = (policy.annotations ?? []).filter(item => ruleHolds(item, values, facts)).map(item => String(item.add))
  const unsure = sortedStrings(Object.entries(values).filter(([, r]) => r.kind === 'noul' && r.unsure).map(([name]) => name))
  return { action, matched_rule: fired.length ? fired[0]! : null, fired_rules: fired, annotations, unsure }
}

// ── drift ────────────────────────────────────────────────────────────────────

const VERSION = py('(\\d+)\\.(\\d+)(?:\\.(\\d+))?')

/** The version a model id names (jev-1.13.0 -> [1, 13, 0]), or [] when it names none. */
export function versionOf(model: string | null | undefined): number[] {
  const found = VERSION.exec(model ?? '')
  if (!found) return []
  return found.slice(1).filter(part => part !== undefined).map(part => Number(part.replace(/\p{Nd}/gu, d => String(digitValue(d)))))
}

/**
 * A Unicode decimal digit's value, as Python's int() reads it. Decimal digits come in whole runs
 * of ten from zero, some runs back to back (the mathematical digits are five), so the value is
 * the distance from the start of the run, modulo ten.
 */
function digitValue(d: string): number {
  const cp = d.codePointAt(0)!
  let start = cp
  while (start > 0 && cp - start < 60 && /\p{Nd}/u.test(String.fromCodePoint(start - 1))) start--
  return (cp - start) % 10
}

/**
 * True when the answering model is not the version the thresholds were tuned on; null when either
 * side names no version. Versions compare on the parts both name (jev-1.13-free matches jev-1.13.0).
 */
export function drifted(tunedOn: string | null | undefined, model: string | null | undefined): boolean | null {
  const tuned = versionOf(tunedOn), seen = versionOf(model)
  if (!tuned.length || !seen.length) return null
  const width = Math.min(tuned.length, seen.length)
  return tuned.slice(0, width).some((part, i) => part !== seen[i])
}

/** True when a named backend answered a policy that was not tuned for it (recorded, not acted on). */
export function untuned(policy: Policy, provider: string | null | undefined): boolean {
  return !!provider && !BUILT_IN_PROVIDERS.includes(provider) && policy._origin !== 'backend'
}
