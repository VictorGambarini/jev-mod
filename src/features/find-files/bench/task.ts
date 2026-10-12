// find-files' task-level bench: plain Claude Code finding code with its own tools (Glob, Grep, Read,
// Explore agents, whatever it picks) against Claude Code with find-files on, so it is also offered
// `mcp__jev-mod__find_files`. Both arms get the same prompt, which never mentions the tool: whether
// the model reaches for it is part of what is measured.
//
// The project is tillbox (task-fixture/, written by task-fixture-gen.py): a TypeScript billing and
// orders API of about 320 files, with the files each task looks for and near-misses that share their
// words (a retry policy for payment calls, a rounding helper, TAX_RATE_OVERRIDE, a refundPaymentLater,
// the signing side of the webhooks, the invoice table's look-alikes). Ten questions a person asks
// when they join a codebase: which file defines something, what calls a function, every place that
// reads a variable, which migrations touch a table.
//
// A task has one step: the question, a stated answer format, and nothing may be edited. The checker
// reads the ANSWERS block of the reply and compares it with the gold, in code: precision and recall
// of the files (or of file:line, for the questions that ask for lines). The score is F1; success is
// every gold item found and nothing else listed.

import type { Arm, Checked, Row, Step, TaskAdapter, TaskCase } from '../../../bench/types'
import { REPO, repoTasks, WHAT } from './task-repo'

const FIXTURE = 'src/features/find-files/bench/task-fixture'

/** A line answer within this many lines of the gold line is right (a call can span a few lines). */
export const LINE_SLACK = 2

/**
 * One right answer: a file, and for line questions its line and the pattern that line matches
 * (task-check.ts checks the two against the fixture, so a regenerated fixture cannot drift).
 */
export type Gold = { path: string; line?: number; needle?: RegExp }
export type FindTask = TaskCase & {
  /** What the person asks. */
  ask: string
  /** `paths`: a file per line; `lines`: path:line. */
  format: 'paths' | 'lines'
  /** `repo`: the large real project (task-repo.ts), where an answer may be NONE; else the small fixture. */
  suite?: 'repo'
  /** For `lines`: what the line is, in the format hint ("the line that reads the variable"). */
  lineIs?: string
  /** The right answers; none when nothing in the project does what is asked (the answer is NONE). */
  gold: Gold[]
}

// what a person lets a read-only search session do without asking; the question step refuses edits
export const SEARCH_TOOLS = ['Read', 'Grep', 'Glob', 'Task', 'Agent', 'mcp__jev-mod__find_files', 'Bash(grep:*)', 'Bash(rg:*)', 'Bash(find:*)',
  'Bash(ls:*)', 'Bash(cat:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(wc:*)', 'Bash(git grep:*)', 'Bash(git ls-files:*)']
const NO_EDITS = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit']

const src = (path: string, line?: number, needle?: RegExp): Gold => ({ path, ...(line ? { line, needle } : {}) })
const base = { fixture: FIXTURE, git: true, setup: [], allowedTools: SEARCH_TOOLS }

export const TASKS: FindTask[] = [
  { ...base, id: 'webhook-retry', format: 'paths',
    ask: 'Which file defines the retry schedule for webhook deliveries to our customers: how long we wait between attempts and when we give up?',
    gold: [src('src/webhooks/dispatcher/retry-policy.ts')] },
  { ...base, id: 'invoice-rounding', format: 'paths',
    ask: 'Which file defines how an invoice total is rounded?',
    gold: [src('src/billing/invoice/rounding.ts')] },
  { ...base, id: 'tax-rate-env', format: 'lines', lineIs: 'the line that reads the variable',
    ask: 'Find every place in the code that reads the TAX_RATE environment variable. Count source and scripts, not tests, docs or config examples, and not variables with a similar name.',
    gold: [src('src/billing/tax/default-rate.ts', 3, /process\.env\.TAX_RATE/), src('src/reports/tax-summary.ts', 11, /process\.env\['TAX_RATE'\]/),
      src('scripts/backfill-tax.ts', 4, /process\.env\.TAX_RATE/)] },
  { ...base, id: 'refund-callers', format: 'lines', lineIs: 'the line of the call',
    ask: 'What calls refundPayment? I want the call sites in src/, not its definition, not imports, not tests.',
    gold: [src('src/orders/cancel-order.ts', 11, /await refundPayment\(/), src('src/support/admin/refund-controller.ts', 9, /await refundPayment\(/),
      src('src/disputes/auto-resolve.ts', 11, /await refundPayment\(/)] },
  { ...base, id: 'expired-api-key', format: 'paths',
    ask: 'Which middleware rejects a request that uses an expired API key?',
    gold: [src('src/http/middleware/api-key-auth.ts')] },
  { ...base, id: 'invoice-pdf', format: 'paths',
    ask: 'Which file turns an invoice into the bytes of its PDF?',
    gold: [src('src/billing/invoice/pdf/render-invoice-pdf.ts')] },
  { ...base, id: 'dunning-cron', format: 'lines', lineIs: 'the line that schedules it',
    ask: 'Where is the nightly dunning job scheduled, the line with its cron expression?',
    gold: [src('src/jobs/schedules.ts', 12, /every\('dunning'/)] },
  { ...base, id: 'invoice-migrations', format: 'paths',
    ask: 'Which migrations change the invoices table: create it, alter it or add an index on it? Not other tables with similar names.',
    gold: ['0003_create_invoices', '0011_add_invoice_currency', '0019_invoices_status_index', '0023_billing_cleanup', '0028_add_invoice_region',
      '0031_add_paid_at', '0038_enforce_invoice_numbers'].map(n => src(`migrations/${n}.sql`)) },
  { ...base, id: 'provider-signature', format: 'paths',
    ask: 'Where do we verify the signature on webhooks that the payment provider sends us?',
    gold: [src('src/webhooks/inbound/verify-signature.ts')] },
  { ...base, id: 'customers-export', format: 'paths',
    ask: 'Which files make up the customers CSV export: the route that serves it and the code that builds its rows? Leave out the shared CSV writer.',
    gold: [src('src/customers/export/customers-csv.ts'), src('src/http/routes/customers-export.ts')] },
]

/** The large project's cases (task-repo.ts): paraphrases, near-miss names, and questions with no answer. */
export const REPO_TASKS: FindTask[] = repoTasks(SEARCH_TOOLS)

/** The question as one prompt: the ask, no edits, and the answer format (on the large project, NONE when nothing does it). */
export function promptOf(t: FindTask): string {
  const fmt = t.format === 'lines'
    ? `\`path:line\`, path relative to the project root and line number of ${t.lineIs ?? 'the match'}`
    : '`path`, relative to the project root'
  const none = t.suite === 'repo' ? ' If nothing in this project does it, put the single line `NONE` under ANSWERS.' : ''
  return `${t.ask}\n\nSearch this project; do not change any files. End your reply with a line \`ANSWERS\`, then one answer per line as ${fmt}, nothing else on those lines.${none}`
}

export type Answer = { path: string; line: number | null }

/**
 * The answers in a reply: the lines after its last `ANSWERS` line (else every line that starts like a
 * path), each cleaned of bullets, numbers, backticks and bold, with the project's own folder cut off.
 */
export function answersOf(text: string, workdir = ''): Answer[] {
  const lines = text.split('\n')
  let from = 0
  lines.forEach((l, i) => { if (/^[\s*_`#>-]*ANSWERS?[\s*_`:]*$/i.test(l)) from = i + 1 })
  const out: Answer[] = []
  for (const raw of lines.slice(from)) {
    let l = raw.trim().replace(/^[-*+•>]\s+/, '').replace(/^\d+[.)]\s+/, '').replace(/[`*]/g, '').trim()
    if (workdir && l.startsWith(workdir)) l = l.slice(workdir.length).replace(/^\/+/, '')
    l = l.replace(/^\.\//, '')
    const m = /^([\w@.\/-]+\.[A-Za-z0-9]+)(?:(?::|#L|\s*\(\s*line\s*)(\d+))?/i.exec(l)
    if (m) out.push({ path: m[1]!, line: m[2] ? Number(m[2]) : null })
  }
  return out
}

/**
 * Precision and recall of the answers against the gold; the score is F1, success is both 1. A
 * question with no gold is right (score 1) only when nothing was answered (NONE is not a path).
 */
export function score(t: FindTask, answers: readonly Answer[]): Checked {
  const byLine = t.format === 'lines'
  const seen = new Set<string>()
  const unique = answers.filter(a => {
    const k = byLine ? `${a.path}:${a.line}` : a.path
    return seen.has(k) ? false : (seen.add(k), true)
  })
  const hits = (a: Answer, g: Gold) => g.path === a.path
    && (!byLine || (a.line !== null && g.line !== undefined && Math.abs(a.line - g.line) <= LINE_SLACK))
  const right = unique.filter(a => t.gold.some(g => hits(a, g)))
  const found = t.gold.filter(g => unique.some(a => hits(a, g)))
  const precision = unique.length ? right.length / unique.length : 0
  const recall = t.gold.length ? found.length / t.gold.length : 0
  const f1 = precision + recall ? 2 * precision * recall / (precision + recall) : 0
  const name = (a: Answer) => (a.line === null ? a.path : `${a.path}:${a.line}`)
  if (!t.gold.length) {
    const right = unique.length === 0
    return { success: right, score: right ? 1 : 0, detail: { precision: right ? 1 : 0, recall: 1, answered: unique.length, gold: 0, wrong: unique.map(name), missed: [] } }
  }
  return { success: precision === 1 && recall === 1, score: f1, detail: {
    precision, recall, answered: unique.length, gold: t.gold.length,
    wrong: unique.filter(a => !right.includes(a)).map(name), missed: t.gold.filter(g => !found.includes(g)).map(g => g.path) } }
}

// ── the estimate ─────────────────────────────────────────────────────────────

/**
 * About what one question costs Claude: a search of ~320 files by Glob, Grep and Read takes a
 * handful of turns; one of ~4,500 files (the large project) takes more of them.
 */
export const USD = { plain: 0.25, jev: 0.25, repo: 0.45 }

const suiteOf = (c: { id: string; suite?: string }) => (c.suite === 'repo' ? 'large project' : 'small fixture')
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : 0
}

/**
 * The report's own block: each suite apart (the small fixture's questions share the code's words;
 * the large project's do not), per arm: runs, success, mean score, median time, Claude's and the
 * decision model's cost per run, and how often find_files was called and how it answered.
 */
export function report(rows: readonly Row[]): string {
  const bySuite = new Map(ALL.map(t => [t.id, suiteOf(t)]))
  const out = ['**By suite.** The small fixture (tillbox, 320 files) and the large project (' +
    `${REPO.name} ${REPO.tag}, ~4,500 files) apart; find_files calls are read from the ledger, so a call that asked no decision model still counts.`, '',
    '| suite | arm | runs | success | mean score | median time | Claude $/run | decisions $/run | runs that called find_files | find_files answers |',
    '|---|---|---|---|---|---|---|---|---|---|']
  const keys = new Map<string, Row[]>()
  for (const r of rows) {
    if (r.setup || !r.arm) continue
    const key = `${bySuite.get(r.case) ?? 'other'}\u0000${r.arm}`
    keys.set(key, [...(keys.get(key) ?? []), r])
  }
  for (const [key, mine] of [...keys].sort(([a], [b]) => a.localeCompare(b))) {
    const [suite, arm] = key.split('\u0000')
    const ok = mine.filter(r => r.outcome === 'ok')
    const pct = (n: number) => `${(100 * n).toFixed(0)}%`
    const avg = (f: (r: Row) => number) => (ok.length ? ok.reduce((n, r) => n + f(r), 0) / ok.length : 0)
    const tools = mine.map(r => r.tool_calls?.['find-files'] ?? {})
    const called = tools.filter(t => Object.values(t).some(n => n > 0)).length
    const hows: Record<string, number> = {}
    for (const t of tools) for (const [how, n] of Object.entries(t)) hows[how] = (hows[how] ?? 0) + n
    const answers = Object.entries(hows).sort(([a], [b]) => a.localeCompare(b)).map(([how, n]) => `${how} ${n}`).join(', ') || '-'
    out.push(`| ${suite} | ${arm} | ${mine.length}${mine.length > ok.length ? ` (${mine.length - ok.length} failed)` : ''} | ${pct(avg(r => (r.success ? 1 : 0)))} | ` +
      `${pct(avg(r => r.score ?? 0))} | ${Math.round(median(ok.map(r => r.wall_ms ?? 0)))} ms | $${avg(r => r.claude_cost_usd ?? 0).toFixed(3)} | ` +
      `$${avg(r => r.cost_usd).toFixed(5)} | ${called} of ${mine.length} | ${answers} |`)
  }
  return out.join('\n')
}

/** Both suites: the small fixture's ten, then the large project's. `--cases saleor-*` runs only the large one. */
export const ALL: FindTask[] = [...TASKS, ...REPO_TASKS]

export const task: TaskAdapter<FindTask> = {
  feature: 'find-files',
  cases: () => ALL,
  steps(t, arm): Step[] {
    return [{ prompt: promptOf(t), final: true, disallowedTools: NO_EDITS, usd: t.suite === 'repo' ? USD.repo : arm.kind === 'jev-mod' ? USD.jev : USD.plain }]
  },
  overlay(arm): { features: Record<string, Record<string, unknown>> } {
    if (arm.kind !== 'jev-mod') return { features: {} }
    const knobs = Object.fromEntries(['limit', 'maxCandidates', 'timeoutMs'].filter(k => typeof arm.settings[k] === 'number').map(k => [k, arm.settings[k]]))
    return { features: { 'find-files': { mode: 'on', ...knobs } } }
  },
  check: (t, finalText, workdir) => score(t, answersOf(finalText, workdir)),
  usdPerCall: USD.plain,
  maxUsdPerCall: 1.5,
  decisionCallsPerArm: 3,
  estimateNote: cases => {
    const repo = cases.filter(c => c.suite === 'repo').length
    return [
      ...(cases.length - repo ? [`  ${cases.length - repo} small-fixture question(s) priced at about $${USD.plain.toFixed(2)}, either arm (the smoke run: four questions, $0.21 to $0.30 each, a search of ~320 files in a few turns on cached context);`] : []),
      ...(repo ? [`  ${repo} large-project question(s) priced at about $${USD.repo.toFixed(2)}, either arm (${REPO.name} ${REPO.tag}, ~4,500 files: more turns per question);`] : []),
      '  no shared setup: each question is one headless call in a fresh copy of the project. The decision model judges up to 60 file cards per find_files call.',
      ...(repo ? [`  the large project is cloned once per run (${REPO.url} at ${REPO.commit.slice(0, 12)}, about 100 MB, into the run's scratch folder) and hard-linked into each arm's folder.`] : []),
      '  only one suite: --cases saleor-* (the large project), or the small fixture\'s ids.',
    ]
  },
  report,
}

/** What each large-project case tests (task-repo.ts), for the README and the checks. */
export { WHAT }
