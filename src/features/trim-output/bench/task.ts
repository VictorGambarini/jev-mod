// trim-output's task-level bench: ten small projects (task-fixture/, made by task-fixture-gen.py)
// whose natural command prints hundreds of lines: test suites with hundreds of passes and a few
// failures (pytest, go test, node --test), a verbose build, a migration dry run, and a replayed
// request trace. A person asks Claude Code to run it and fix what is wrong, or to say why it failed.
//
//   arms: plain Claude Code (sees every line), jev-mod with trim-output on (the decision model
//         cuts what the goal does not need), and jev-mod folding only (`localOnly`: repeats and
//         unchanged failures are folded locally, nothing is sent to a model), so the table shows
//         what the decision model adds over folding alone
//
// The checker is deterministic: for a fix, the project's own tests (or build, or dry run) run
// again on the arm's folder with the original tests and scripts put back, so the only way to
// pass is to fix the code; for the diagnosis, the answer must name the request, the tenant and
// the cause. Each arm works in a copy of its own (`isolate`), so one arm's fix is not the next
// arm's starting point.
//
// There is no verify: whether trimming fired shows in context_tokens and in the decision calls, and folding
// alone often does it without asking a model, so an arm that asked none is not an arm that did nothing.
//
// context_tokens here is the input tokens of the whole run (cached or not), added up over its
// model calls: a long output the model keeps rereading on every turn costs that many times.

import type { Arm, Checked, Step, TaskAdapter, TaskCase } from '../../../bench/types'

export type Check =
  | { kind: 'tests'; argv: string[]; restore: string[] }
  | { kind: 'script'; argv: string[]; restore: string[] }
  | { kind: 'answer'; patterns: RegExp[] }
export type TrimTask = TaskCase & { prompt: string; check: Check; /** About how many lines the first long command prints. */ lines: number }

const FIXTURE = 'src/features/trim-output/bench/task-fixture'
// what a person lets a coding session do in the scratch copy without asking
const TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'MultiEdit', 'Write', 'Bash(python3:*)', 'Bash(python:*)', 'Bash(pytest:*)',
  'Bash(go:*)', 'Bash(node:*)', 'Bash(npm:*)', 'Bash(make:*)', 'Bash(./build.sh:*)', 'Bash(sh:*)', 'Bash(bash:*)', 'Bash(ls:*)', 'Bash(wc:*)',
  'Bash(grep:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(cat:*)', 'Bash(sed:*)', 'Bash(mv:*)', 'Bash(cp:*)', 'Bash(rm:*)', 'Bash(cd:*)', 'Bash(git:*)']

const FIX = 'Fix the code, not the tests.'
const PYTEST = ['python3', '-m', 'pytest', '-q', '-p', 'no:cacheprovider']

export const TASKS: TrimTask[] = [
  {
    id: 'slugify-letters', fixture: `${FIXTURE}/slugify`, git: true, isolate: true, setup: [], allowedTools: TOOLS, lines: 1100,
    prompt: 'A few of our page titles come out with the wrong slug. Run the tests with `make test`, work out why ' +
      `the failing ones fail, and fix it in slugger/. ${FIX} When it is all green, say in one sentence what was wrong.`,
    check: { kind: 'tests', argv: PYTEST, restore: ['tests'] },
  },
  {
    id: 'tax-refunds', fixture: `${FIXTURE}/pricing`, git: true, isolate: true, setup: [], allowedTools: TOOLS, lines: 450,
    prompt: 'Finance says some refund tax amounts are a cent out. `make test` shows what fails; find the cause in shop/ and ' +
      `fix it. ${FIX} Tell me in a sentence what it was.`,
    check: { kind: 'tests', argv: PYTEST, restore: ['tests'] },
  },
  {
    id: 'month-ends', fixture: `${FIXTURE}/cycles`, git: true, isolate: true, setup: [], allowedTools: TOOLS, lines: 550,
    prompt: 'Billing cycles that start at the end of a month sometimes land on the wrong day. Run `make test`, find what ' +
      `is wrong in billing/calendar_utils.py and fix it. ${FIX}`,
    check: { kind: 'tests', argv: PYTEST, restore: ['tests'] },
  },
  {
    id: 'csv-quotes', fixture: `${FIXTURE}/csvparse`, git: true, isolate: true, setup: [], allowedTools: TOOLS, lines: 300,
    prompt: 'Our CSV import mangles some customer notes. Run `make test`, see which lines fail and why, and ' +
      `fix csvlite/parser.py. ${FIX}`,
    check: { kind: 'tests', argv: PYTEST, restore: ['tests'] },
  },
  {
    id: 'prerelease-order', fixture: `${FIXTURE}/semver`, git: true, isolate: true, setup: [], allowedTools: TOOLS, lines: 560,
    prompt: 'Release candidates are sorting in the wrong order in our updater. `make test` runs the version comparison ' +
      `tests; find out what is wrong in vercmp/ and fix it. ${FIX}`,
    check: { kind: 'tests', argv: PYTEST, restore: ['tests'] },
  },
  {
    id: 'pib-sizes', fixture: `${FIXTURE}/sizes`, git: true, isolate: true, setup: [], allowedTools: TOOLS, lines: 570,
    prompt: 'A handful of size parsing tests fail in this Go package. Run `make test`, find the cause and fix sizes.go. ' +
      `${FIX} One sentence on what it was when done.`,
    check: { kind: 'tests', argv: ['go', 'test', '-v', './...'], restore: ['sizes_test.go'] },
  },
  {
    id: 'lru-falsy', fixture: `${FIXTURE}/lru`, git: true, isolate: true, setup: [], allowedTools: TOOLS, lines: 350,
    prompt: 'The LRU cache loses some entries it should have kept. Run `npm test`, see which scenarios fail, and fix src/lru.js. ' +
      `${FIX}`,
    check: { kind: 'tests', argv: ['npm', 'test'], restore: ['test'] },
  },
  {
    id: 'build-template', fixture: `${FIXTURE}/site`, git: true, isolate: true, setup: [], allowedTools: TOOLS, lines: 380,
    prompt: 'The site build is failing. Run `make build`, find out what breaks it and fix it so the build finishes. Do not change ' +
      'build.sh or anything in tools/.',
    check: { kind: 'script', argv: ['./build.sh'], restore: ['build.sh', 'tools'] },
  },
  {
    id: 'migration-order', fixture: `${FIXTURE}/app`, git: true, isolate: true, setup: [], allowedTools: TOOLS, lines: 600,
    prompt: 'The migrations stop partway in CI. `make check` is the dry run; run it to see where, work out why, and fix the ' +
      'migrations so all of them apply cleanly. Do not edit tools/migrate.py, and do not change what any migration does.',
    check: { kind: 'script', argv: ['python3', 'tools/migrate.py', '--dry-run'], restore: ['tools'] },
  },
  {
    id: 'pool-timeouts', fixture: `${FIXTURE}/trace`, git: true, isolate: true, setup: [], allowedTools: TOOLS, lines: 1080,
    prompt: 'Users reported 500s from the API on 2026-10-09 around 03:02. Replay the trace with `make replay` and tell me which request failed first, which tenant it belongs to, and why it failed: the root cause, ' +
      'not only the error message. Do not change anything. A few lines is enough.',
    check: { kind: 'answer', patterns: [/r-4861/, /t-0417/, /pool/i, /reload|pool_size|10\s*(to|→|->|=>)\s*2|shrunk|shrank|reduc|lower|smaller|dropped/i, /export/i] },
  },
]

/** Passed and failed counts out of a runner's output, when it prints them. */
export function counts(output: string): { pass: number; fail: number } | null {
  const num = (re: RegExp) => Number(re.exec(output)?.[1] ?? NaN)
  // pytest: "3 failed, 397 passed in 0.2s"; node: "ℹ pass 4" and "ℹ fail 1"
  const pytest = /\b(\d+) (passed|failed)\b/g
  let pass = 0
  let fail = 0
  let found = false
  for (const m of output.matchAll(pytest)) {
    found = true
    if (m[2] === 'passed') pass = Number(m[1])
    else fail = Number(m[1])
  }
  if (found) return { pass, fail }
  const nodePass = num(/ℹ pass (\d+)/)
  const nodeFail = num(/ℹ fail (\d+)/)
  if (Number.isFinite(nodePass) && Number.isFinite(nodeFail)) return { pass: nodePass, fail: nodeFail }
  // go: one line per failing subtest, "--- FAIL:", and "--- PASS:" for each that passed
  const goFail = (output.match(/^\s*--- FAIL:/gm) ?? []).length
  const goPass = (output.match(/^\s*--- PASS:/gm) ?? []).length
  if (/^(ok|FAIL)\s/m.test(output)) return { pass: goPass, fail: goFail }
  return null
}

/** The answer's patterns: every one must match. */
export function checkAnswer(patterns: readonly RegExp[], text: string): Checked {
  const right = patterns.map(p => p.test(text))
  const n = right.filter(Boolean).length
  return { success: n === patterns.length, score: patterns.length ? n / patterns.length : 0, detail: { right } }
}

// Claude's prices per token that the 2026-10-11 smoke (csv-quotes, three arms, $0.21 each) fits within about 5%:
// a cache read, a cache write, an output token. The compact bench's pilot fitted three times these.
export const PRICE = { read: 0.5e-6, write: 6.25e-6, out: 25e-6 }
// a fresh session: Claude Code's own system prompt and tools, read from the cache on every call; a fix takes about five calls
const SYSTEM_TOKENS = 28_000
const TURNS = 5
const OUT_PER_TURN = 400
const TOKENS_PER_LINE = 14

/** About what one task costs plain: eight calls on a context that grows, the long output written once. */
export function stepUsd(t: TrimTask): number {
  const log = t.lines * TOKENS_PER_LINE
  const context = SYSTEM_TOKENS + log + 6000
  return TURNS * context * PRICE.read + (SYSTEM_TOKENS + log + 6000) * PRICE.write + TURNS * OUT_PER_TURN * PRICE.out
}

/** The adapter around a checker. task-check.ts supplies the one that runs the projects; tests need no processes. */
export const taskAdapter = (check: TaskAdapter<TrimTask>['check']): TaskAdapter<TrimTask> => ({
  feature: 'trim-output',
  cases: () => TASKS,
  extraArms: (): Arm[] => [{ id: 'jev-mod folding only', kind: 'jev-mod', backend: null, settings: { localOnly: true } }],
  steps: (t): Step[] => [{ prompt: t.prompt, final: true, usd: stepUsd(t) }],
  overlay(arm): { features: Record<string, Record<string, unknown>> } {
    if (arm.kind === 'claude') return { features: {} }
    const section: Record<string, unknown> = { mode: 'on' }
    if (typeof arm.settings.keepThreshold === 'number') section.keepThreshold = arm.settings.keepThreshold
    if (arm.settings.localOnly === true) section.localOnly = true
    return { features: { 'trim-output': section } }
  },
  check,
  usdPerCall: 1.5,
  maxUsdPerCall: 4,
  // one long output is judged in one request; a task prints two or three
  decisionCallsPerArm: 3,
  estimateNote: cases => {
    const c = cases[0] as TrimTask | undefined
    if (!c) return []
    const m = (n: number) => `$${(n * 1e6).toFixed(2)}/M`
    return [
      `  priced from ${TURNS} calls on a ${SYSTEM_TOKENS / 1000}k system prompt plus the full output (about ${TOKENS_PER_LINE} tokens a line), at ${m(PRICE.read)} cache read, ` +
        `${m(PRICE.write)} cache write, ${m(PRICE.out)} output: ${TASKS.map(t => `${t.id} $${stepUsd(t).toFixed(2)}`).join(', ')}`,
      '  the folding-only arm asks no model, so its decision cost is $0; it is priced as a jev-mod arm here',
    ]
  },
})
