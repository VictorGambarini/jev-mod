// review-triage's task-level bench: ten uncommitted changes to a small shop service
// (task-fixture/, made by task-fixture-gen.py), reviewed by Claude Code the way a person asks:
// "I'm about to commit this, review it for bugs". Three changes are clean (docs, a rename,
// logging) and seven carry one to three real defects among harmless edits: an off-by-one, a
// missing admin check, SQL built by string formatting, a partial refund that double refunds and
// restocks, a migration that drops a column still read, float money with a swallowed exception,
// a coupon with three bugs.
//
//   arms: plain Claude Code (no triage tool), and jev-mod with `review_triage` offered. Both get
//         the same prompt and the same read-only tools. A jev-mod arm's prompt ends with "Use the
//         review_triage tool first to decide how deep to go", what a person who turned the feature
//         on would put in their CLAUDE.md, because the 2026-10-11 smoke showed that Claude Code,
//         offered the tool and told by its description to call it first, did not call it. Sweep
//         `told` (`--sweep told=0:1:1`) to run both: told=0 is the bare prompt, and an arm that
//         then never calls the tool is `not_triaged`, which is the adoption result.
//
// What review-triage can change is how deep the review goes (quick: one pass; full: the named
// files first), so the bench asks what that does to the review: defects caught, false findings
// reported, time and cost. It cannot judge the verdict by itself: a quick verdict on a clean change is
// right and saves work, and on a buggy one it costs the defect.
//
// The checker is deterministic. Claude answers with one `FINDING: <file>:<line> - <text>` line per
// defect; each is matched to the gold by file and line (a gold spot is a line of the changed file,
// found by a needle, plus a margin). Matching a defect is a catch; a finding that matches no defect
// and no tolerated spot is false. A tolerated spot is a real but minor issue the prompt did not ask
// for (an unused parameter, a silent limit), neither rewarded nor charged. A line that cannot be read as
// file:line counts as false: the same rule for both arms.
//
// An arm is an error, never a score, when the jev-mod arm's review_triage never asked the decision
// model (`not_triaged`): the tool was not called, or it answered without asking, and then the arm
// is plain Claude Code under another name.

import type { Arm, ArmRun, Checked, Step, TaskAdapter, TaskCase } from '../../../bench/types'

/** A line of the changed file where a defect is, found by a needle; the margin is in lines either side. */
export type Spot = { id: string; file: string; needle: string; before?: number; after?: number }
export type ReviewTask = TaskCase & { prompt: string; bugs: Spot[]; tolerated: Spot[]; /** Lines of the patch, for the estimate. */ patchLines: number }

const FIXTURE = 'src/features/review-triage/bench/task-fixture'
// read-only: a review changes nothing. The triage tool is allowed in both arms; plain Claude Code does not have it.
const TOOLS = ['Read', 'Grep', 'Glob', 'Bash(git diff:*)', 'Bash(git status:*)', 'Bash(git log:*)', 'Bash(git show:*)', 'Bash(cat:*)',
  'Bash(grep:*)', 'Bash(ls:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(wc:*)', 'Bash(python3:*)', 'mcp__jev-mod__review_triage']

export const TELL = ' Use the review_triage tool first to decide how deep to go.'

export const PROMPT = 'I have uncommitted changes in this repo that I am about to commit. Please review them for bugs first. ' +
  'Only report real defects, things that will misbehave or break something: no style, naming, missing tests or nitpicks. ' +
  'Give one line per defect, exactly like `FINDING: <file>:<line> - <what is wrong>`, with the line number in the changed file. ' +
  'If you find no defect, write `FINDING: none`.'

const base = (id: string, patchLines: number, bugs: Spot[], tolerated: Spot[] = []): ReviewTask => ({
  id, fixture: `${FIXTURE}/base`, patch: `${FIXTURE}/patches/${id}.patch`, git: true, setup: [], allowedTools: TOOLS,
  prompt: PROMPT, bugs, tolerated, patchLines,
})

export const TASKS: ReviewTask[] = [
  // clean: documentation and docstrings only
  base('docs-typos', 87, []),
  // clean: one function renamed, every caller updated
  base('rename-money', 64, []),
  // clean: log lines added
  base('logging', 60, []),
  base('bulk-threshold', 36, [{ id: 'off-by-one', file: 'shop/pricing.py', needle: 'if qty > BULK_THRESHOLD:' }]),
  base('admin-export', 32, [{ id: 'no-admin-check', file: 'shop/api.py', needle: 'def handle_export_orders', before: 2, after: 7 }]),
  base('order-search', 45, [{ id: 'sql-injection', file: 'shop/orders.py', needle: "LIKE '%{text}%'", before: 1, after: 1 }],
    [{ id: 'silent-limit', file: 'shop/orders.py', needle: 'limit=50' }]),
  base('partial-refund', 49, [
    { id: 'refund-over-total', file: 'shop/orders.py', needle: 'if amount_cents <= 0 or amount_cents > order["total_cents"]:' },
    { id: 'partial-restocks', file: 'shop/orders.py', needle: '        restock(conn, order_id)' },
  ], [{ id: 'explicit-total', file: 'shop/orders.py', needle: 'full = amount_cents is None' }]),
  base('drop-notes', 46, [
    { id: 'drops-data', file: 'migrations/002_drop_order_notes.sql', needle: 'DROP COLUMN notes' },
    { id: 'reader-breaks', file: 'shop/notifications.py', needle: 'if order["notes"]:', before: 1, after: 1 },
  ], [{ id: 'ignored-param', file: 'shop/orders.py', needle: 'def create_order(conn, user_id, lines, notes=None):' }]),
  base('float-and-swallow', 34, [
    { id: 'float-money', file: 'shop/pricing.py', needle: 'return round(amount_cents * TAX_RATE_BP / 10000)' },
    { id: 'swallowed', file: 'shop/notifications.py', needle: 'except Exception:', before: 1, after: 1 },
  ]),
  base('coupons', 87, [
    { id: 'expiry-inverted', file: 'shop/coupons.py', needle: 'if coupon["expires"] < now:', after: 1 },
    { id: 'discount-after-tax', file: 'shop/pricing.py', needle: 'coupon_cents = total * coupon["percent"] // 100', before: 2, after: 2 },
    { id: 'use-not-counted', file: 'shop/coupons.py', needle: 'return dict(coupon)', before: 2 },
  ], [{ id: 'falsy-now', file: 'shop/coupons.py', needle: 'now = now or time.time()' }]),
]

/** One finding line, read: the file and first line (and last, for a range). */
export type Finding = { file: string; line: number; end: number }

const norm = (p: string) => p.replace(/^`+|`+$/g, '').replace(/^\.?\//, '').replace(/^[ab]\//, '')

/** The findings in an answer, and how many `FINDING:` lines had no file:line to read. */
export function findingsOf(text: string): { found: Finding[]; unreadable: number } {
  const found: Finding[] = []
  const seen = new Set<string>()
  let unreadable = 0
  for (const raw of text.split('\n')) {
    const m = /\bFINDING\b\W*(.*)$/i.exec(raw)
    if (!m) continue
    const rest = m[1]!.trim()
    if (/^none\b/i.test(rest)) continue
    const at = /^[`*"' ]*([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)[`*"']*:(\d+)(?:\s*[-–]\s*(\d+))?/.exec(rest)
    if (!at) { unreadable++; continue }
    const file = norm(at[1]!)
    const line = Number(at[2])
    const end = at[3] ? Number(at[3]) : line
    const key = `${file}:${line}`
    if (seen.has(key)) continue
    seen.add(key)
    found.push({ file, line, end: Math.max(line, end) })
  }
  return { found, unreadable }
}

/** A spot made concrete: the lines it covers in the changed file, margin included. */
export type Span = { id: string; file: string; from: number; to: number }
/** The slack either side of a spot, in lines: a finding on the line above or below still points at it. */
export const MARGIN = 2

/** The 1-based lines of a file that contain the needle. */
export function linesWith(text: string, needle: string): number[] {
  const out: number[] = []
  text.split('\n').forEach((line, i) => { if (line.includes(needle)) out.push(i + 1) })
  return out
}

const hits = (f: Finding, s: Span) => (f.file === s.file || f.file.endsWith(`/${s.file}`) || s.file.endsWith(`/${f.file}`)) && f.end >= s.from - MARGIN && f.line <= s.to + MARGIN

export type Score = { caught: string[]; missed: string[]; matched: number; tolerated: number; false: number; unreadable: number; findings: number }

/** Findings against the gold: catches, misses, the tolerated, and the false ones. */
export function scoreFindings(found: readonly Finding[], unreadable: number, bugs: readonly Span[], tolerated: readonly Span[]): Score {
  const caught = new Set<string>()
  let matched = 0
  let ok = 0
  let bad = unreadable
  for (const f of found) {
    const bug = bugs.filter(s => hits(f, s))
    if (bug.length) { matched++; for (const s of bug) caught.add(s.id) }
    else if (tolerated.some(s => hits(f, s))) ok++
    else bad++
  }
  return { caught: bugs.filter(s => caught.has(s.id)).map(s => s.id), missed: bugs.filter(s => !caught.has(s.id)).map(s => s.id),
    matched, tolerated: ok, false: bad, unreadable, findings: found.length + unreadable }
}

/** Success: every defect caught and nothing false (a clean change: no false finding). Score: F1 of recall and precision; a clean change 1 or 0. */
export function checkedOf(s: Score, bugs: number): Checked {
  const recall = bugs ? s.caught.length / bugs : 1
  const precision = s.matched + s.false ? s.matched / (s.matched + s.false) : 1
  const success = s.missed.length === 0 && s.false === 0
  const f1 = bugs === 0 ? (s.false === 0 ? 1 : 0) : recall + precision ? 2 * recall * precision / (recall + precision) : 0
  return { success, score: f1, detail: { ...s, recall, precision } }
}

/** Whether a jev-mod arm's prompt tells Claude to use the tool: yes unless the arm's `told` is 0 or false. */
export const told = (arm: Arm) => arm.settings.told !== 0 && arm.settings.told !== false

/** Plain Claude Code has no triage; a jev-mod arm whose triage asked no decision model is plain Claude Code under another name. */
export function verify(_t: ReviewTask, arm: Arm, run: ArmRun): string | null {
  if (arm.kind !== 'jev-mod') return null
  return (run.byFeature['review-triage']?.requests ?? 0) === 0 ? 'not_triaged' : null
}

// Claude's prices per token that the trim-output smoke fitted (a cache read, a cache write, an output token).
export const PRICE = { read: 0.5e-6, write: 6.25e-6, out: 25e-6 }
const SYSTEM_TOKENS = 28_000
const TURNS = 6
const TOKENS_PER_PATCH_LINE = 12
const FILES_READ_TOKENS = 6000
const OUT_TOKENS = 1200

/** About what one review costs: a handful of calls on the system prompt, the diff and the files it reads. */
export function stepUsd(t: ReviewTask): number {
  const context = SYSTEM_TOKENS + t.patchLines * TOKENS_PER_PATCH_LINE + FILES_READ_TOKENS
  return TURNS * context * PRICE.read + context * PRICE.write + OUT_TOKENS * PRICE.out
}

/** The adapter around a checker. task-check.ts supplies the one that reads the files; tests need none. */
export const taskAdapter = (check: TaskAdapter<ReviewTask>['check']): TaskAdapter<ReviewTask> => ({
  feature: 'review-triage',
  cases: () => TASKS,
  steps: (t, arm): Step[] => [{ prompt: t.prompt + (arm.kind === 'jev-mod' && told(arm) ? TELL : ''), final: true, usd: stepUsd(t) }],
  overlay(arm): { features: Record<string, Record<string, unknown>> } {
    if (arm.kind === 'claude') return { features: {} }
    const section: Record<string, unknown> = { mode: 'on' }
    if (typeof arm.settings.minConfidence === 'number') section.minConfidence = arm.settings.minConfidence
    return { features: { 'review-triage': section } }
  },
  check,
  verify,
  usdPerCall: 0.5,
  maxUsdPerCall: 2,
  // one request for the verdict, one more that names the files when something is flagged
  decisionCallsPerArm: 2,
  estimateNote: cases => {
    const m = (n: number) => `$${(n * 1e6).toFixed(2)}/M`
    return [
      `  priced from ${TURNS} calls on a ${SYSTEM_TOKENS / 1000}k system prompt, the diff (about ${TOKENS_PER_PATCH_LINE} tokens a line) and ${FILES_READ_TOKENS / 1000}k of files read, ` +
        `at ${m(PRICE.read)} cache read, ${m(PRICE.write)} cache write, ${m(PRICE.out)} output: ${cases.map(c => `${c.id} $${stepUsd(c as ReviewTask).toFixed(2)}`).join(', ')}`,
    ]
  },
})
