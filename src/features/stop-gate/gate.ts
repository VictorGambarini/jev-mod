// The completion gate's rules, with no IO: which final messages claim the work is done, what
// evidence from the turn is shown to the decision model (trimmed to a budget), what its answers
// mean, the nudge's words, and how many nudges a prompt may take.
//
// Jev never writes text, so the nudge names a claim in the agent's own words: the claims are
// cut from the final message here, and Jev picks the one least supported by the evidence.

import { choice, noul, type Answer, type Question } from '../../engine/client'

export const TAG = '[jev-mod completion gate]'

// ── claims ───────────────────────────────────────────────────────────────────

// Words that say work is finished or that something passes. Read loosely: a false match costs
// one decision call, a missed claim lets an unsupported answer through as plain Claude Code.
const CLAIM = new RegExp([
  String.raw`\b(?:done|complete[ds]?|finished|implemented|fixed|resolved|succeed(?:s|ed)?|successful(?:ly)?`,
  String.raw`|pass(?:es|ed|ing)?|verified|confirmed|all set|all green|no (?:errors?|failures?)`,
  String.raw`|(?:it|this|that|now|everything|all) (?:works|is working)|ready to (?:merge|ship|use|go|review)|is ready(?!-))\b`,
  String.raw`|✅|✔|☑`,
].join(''), 'i')

// Hedged or negated finishes are not claims: "not yet done", "could not verify", "I didn't write it".
const HEDGED = /\b(?:not (?:yet )?(?:done|complete|finished|fixed|verified|working)|could ?n[o']t|cannot|can't|unable|untested|unverified|did ?n[o']t|won't|will not|haven't|have not|isn't|is not)\b/i

export const MAX_CLAIMS = 8
const CLAIM_CHARS = 200

/** Does the final message claim, anywhere, that the work is done or that something passes? */
export function claimsCompletion(text: string): boolean {
  return claims(text).length > 0
}

/**
 * The sentences or list items of the final message that make a completion or success claim.
 * Code and quoted text are not claims ("Done." quoted is a word talked about, not said): they
 * are held aside while the sentence is read, and put back in what is shown.
 */
export function claims(text: string): string[] {
  const held: string[] = []
  const hold = (m: string) => { held.push(m); return `\u0000${held.length - 1}\u0000` }
  const pieces = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`|"[^"\n]{0,300}"|\u201c[^\u201d\n]{0,300}\u201d/g, hold)
    .split(/\n+|(?<=[.!?])\s+/)
    .map(piece => piece.replace(/^[\s>*\-\u2022\d.)#]+/, '').replace(/[*_]/g, '').trim())
    .filter(piece => piece.length >= 3)
  const found: string[] = []
  for (const piece of pieces) {
    const probe = piece.replace(/\u0000\d+\u0000/g, ' ')
    if (!CLAIM.test(probe) || HEDGED.test(probe)) continue
    const shown = piece.replace(/\u0000(\d+)\u0000/g, (_, i) => held[Number(i)]!.replace(/`/g, ''))
    const short = [...shown].length > CLAIM_CHARS ? [...shown].slice(0, CLAIM_CHARS - 1).join('') + '\u2026' : shown
    if (!found.includes(short)) found.push(short)
    if (found.length >= MAX_CLAIMS) break
  }
  return found
}

// ── evidence ─────────────────────────────────────────────────────────────────

/** One transcript message, as `$.session.messages()` gives it (only what the gate reads). */
export type Message = {
  role: 'user' | 'assistant'
  text: string
  toolUses?: readonly { tool: string; input?: Record<string, unknown>; text?: string; isError?: true }[]
}

export type Command = { command: string; failed: boolean; check: boolean; output_tail: string }
export type Evidence = {
  /** Files the agent wrote or edited since the request, newest last. */
  edited_files: string[]
  /** Shell commands since the request, the checks first kept, each with its output's tail. */
  commands: Command[]
  /** How many shell commands were left out to keep within the budget. */
  commands_left_out: number
  /** Other tools and how often each ran. */
  other_tools: Record<string, number>
  /** A test, build, lint or type check ran, and whether one ran after the last edit. */
  ran_checks: boolean
  checks_after_last_edit: boolean
}

const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const SHELLS = new Set(['Bash', 'PowerShell'])
// A command that checks the work: tests, builds, linters, type checkers, validators.
const CHECK = /\b(?:test|tests|pytest|jest|vitest|mocha|rspec|unittest|tox|nox|cargo (?:test|build|check|clippy)|go (?:test|build|vet)|make|cmake|ninja|gradle|mvn|tsc|mypy|pyright|ruff|flake8|pylint|eslint|lint|prettier|black --check|build|compile|validate|check|ctest|dotnet (?:test|build)|swift (?:test|build)|bun test|deno test)\b/i

/** Is this user message the person's own request (not a tool result, not a hook's or the gate's own)? */
export function isRequest(m: Message): boolean {
  if (m.role !== 'user') return false
  const text = m.text.trim()
  if (!text || text.includes(TAG)) return false
  return !/^(?:Stop hook feedback|<(?:system-reminder|command-|local-command|task-notification|bash-))/i.test(text)
}

/** Where the person's latest request is, or -1. */
export function requestIndex(messages: readonly Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) if (isRequest(messages[i]!)) return i
  return -1
}

function tail(text: string, chars: number): string {
  const points = [...text.trimEnd()]
  return points.length <= chars ? points.join('') : '…' + points.slice(-(chars - 1)).join('')
}

/**
 * What the agent did since the request, trimmed to about `budget` characters: every file it
 * edited, then shell commands newest first with checks before the rest, each with the tail of
 * its output. A check's output tail is where a test runner says how many passed.
 */
export function evidence(messages: readonly Message[], budget: number): Evidence {
  const from = requestIndex(messages)
  const uses = messages.slice(from + 1).filter(m => m.role === 'assistant').flatMap(m => m.toolUses ?? [])
  const edited: string[] = []
  const other: Record<string, number> = {}
  const shell: { at: number; command: string; failed: boolean; check: boolean; text: string }[] = []
  let lastEdit = -1
  uses.forEach((use, at) => {
    if (EDITS.has(use.tool)) {
      const path = String(use.input?.file_path ?? use.input?.notebook_path ?? '')
      if (path) {
        if (edited.includes(path)) edited.splice(edited.indexOf(path), 1)
        edited.push(path)
      }
      lastEdit = at
    } else if (SHELLS.has(use.tool)) {
      const command = String(use.input?.command ?? '')
      shell.push({ at, command, failed: use.isError === true, check: CHECK.test(command), text: use.text ?? '' })
    } else {
      other[use.tool] = (other[use.tool] ?? 0) + 1
    }
  })
  const checks = shell.filter(s => s.check)
  const ordered = [...checks.slice().reverse(), ...shell.filter(s => !s.check).reverse()]
  let left = Math.max(budget - edited.join('\n').length, 0)
  const kept: typeof shell = []
  for (const s of ordered) {
    const command = tail(s.command, 300)
    const room = left - command.length - 40
    if (room < 80) break
    // A check keeps more of its output than any other command.
    const take = Math.min(room, s.check ? 1500 : 400)
    kept.push({ ...s, command, text: tail(s.text, take) })
    left -= command.length + 40 + Math.min([...s.text].length, take)
  }
  kept.sort((a, b) => a.at - b.at)
  return {
    edited_files: edited,
    commands: kept.map(s => ({ command: s.command, failed: s.failed, check: s.check, output_tail: s.text })),
    commands_left_out: shell.length - kept.length,
    other_tools: other,
    ran_checks: checks.length > 0,
    checks_after_last_edit: checks.some(s => s.at > lastEdit),
  }
}

// ── the request ──────────────────────────────────────────────────────────────

const REQUEST_CHARS = 1500
const FINAL_CHARS = 3000

/**
 * What Jev reads: the request, the final message, the claims cut from it and the evidence.
 * Every text goes through `redact` (the caller's privacy.redact), so nothing secret-shaped leaves.
 */
export function stateOf(request: string, final: string, found: readonly string[], ev: Evidence, redact: (text: string, limit: number) => string) {
  return {
    task: 'An AI coding agent ended its turn. Judge whether its final message claims more than the tool evidence from this turn shows.',
    user_request: redact(request, REQUEST_CHARS),
    final_message: redact(final, FINAL_CHARS),
    claims: found.map(c => redact(c, 400)),
    evidence: {
      ...ev,
      edited_files: ev.edited_files.map(f => redact(f, 300)),
      commands: ev.commands.map(c => ({ ...c, command: redact(c.command, 400), output_tail: redact(c.output_tail, 2000) })),
    },
  }
}

/** The questions, as client.ts's builders shape them; `weakest` only when there are claims to pick from. */
export function questionsOf(found: readonly string[]): Record<string, Question> {
  const out: Record<string, Question> = {
    claims_done: noul('Does final_message claim that the requested work is finished, or that tests, builds or checks pass?',
      { true: 'it claims completion or success', false: 'it reports progress, a plan, a question or a failure' }),
    supported: noul('Is every completion or success claim in final_message backed by the evidence (edited files, commands and their output)?',
      { true: 'each claim is shown by the evidence', false: 'at least one claim has no evidence, or the evidence contradicts it' }),
    unverified_checks: noul('Does final_message say tests, builds, linters or checks pass when evidence shows no such run after the last edit, or shows one failing?',
      { true: 'checks are claimed but not shown passing', false: 'no such claim, or a passing run is shown' }),
  }
  if (found.length) {
    out.weakest = choice('Which claim from claims is least supported by the evidence?', {
      ...Object.fromEntries(found.map((c, i) => [`claim_${i}`, c])),
      none: 'every claim is supported by the evidence',
    })
  }
  return out
}

/** The answers read off a reply, or null when one is missing or of the wrong type. */
export function answersOf(answers: Record<string, Answer>, found: readonly string[]): Answers | null {
  const p = (name: string) => {
    const a = answers[name]
    return a && a.type === 'noul' ? a.noul : null
  }
  const [claimsDone, supported, unverified] = [p('claims_done'), p('supported'), p('unverified_checks')]
  if (claimsDone === null || supported === null || unverified === null) return null
  const w = answers.weakest
  const picked = w && w.type === 'choice' ? /^claim_(\d+)$/.exec(w.choice) : null
  const weakest = picked && Number(picked[1]) < found.length ? Number(picked[1]) : null
  return { claims_done: claimsDone, supported, unverified_checks: unverified, weakest }
}

// ── the decision ─────────────────────────────────────────────────────────────

/** The probabilities Jev answered: a claim made, every claim supported, checks claimed but not shown. */
export type Answers = {
  claims_done: number
  supported: number
  unverified_checks: number
  /** The claim Jev judged least supported: its index in `claims`, or null for none. */
  weakest: number | null
}

export type Verdict =
  | { nudge: false; why: 'no claim' | 'supported' }
  | { nudge: true; claim: string | null; checks: boolean; confidence: number }

/**
 * Nudge when Jev is at least `minConfidence` sure a completion claim is not backed by the
 * evidence: either some claim is unsupported, or checks are said to pass with no run shown.
 */
export function decide(a: Answers, found: readonly string[], minConfidence: number): Verdict {
  if (a.claims_done < 0.5) return { nudge: false, why: 'no claim' }
  const unsupported = 1 - a.supported
  const confidence = Math.max(unsupported, a.unverified_checks)
  if (confidence < minConfidence) return { nudge: false, why: 'supported' }
  const claim = a.weakest !== null && a.weakest >= 0 && a.weakest < found.length ? found[a.weakest]! : null
  return { nudge: true, claim, checks: a.unverified_checks >= minConfidence, confidence }
}

/** The message the agent reads before it may stop: specific, and never a push toward risk. */
export function nudge(v: Extract<Verdict, { nudge: true }>): string {
  const what = v.claim ? `"${v.claim}"` : 'that the work is complete'
  const lines = [
    `${TAG} Your answer says ${what}, but nothing in this session's tool output shows it.`,
    ...(v.checks ? ['It says tests or checks pass, and no run of them appears after your last change.'] : []),
    'Before you finish: verify it now with a read-only or test command if one exists, or say plainly in your answer what is not verified.',
    'Do not take destructive or hard-to-undo steps (deleting, force-pushing, migrating, deploying, installing) to satisfy this check. '
      + 'If verifying needs one, stop and say so instead.',
  ]
  return lines.join(' ')
}

// ── the cap ──────────────────────────────────────────────────────────────────

/** Nudges given, per user prompt. Only the latest prompt is remembered. */
export type Cap = { key: string | null; given: number }

export function mayNudge(cap: Cap, key: string, max: number): boolean {
  return (cap.key === key ? cap.given : 0) < max
}

/** The cap after one more nudge for `key`. */
export function nudged(cap: Cap, key: string): Cap {
  return { key, given: (cap.key === key ? cap.given : 0) + 1 }
}
