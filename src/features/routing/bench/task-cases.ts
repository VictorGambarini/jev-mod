// Routing's task cases, and how one arm's result is scored. Pure: task.test.ts reads it; task.ts
// runs it. Each case is one prompt a person would type in parcelkit (task-fixture/), a small NZ
// courier codebase in Python: four trivial (a typo, a rename, a one-line fix, a question that
// needs no edit), three medium (a feature over two or three files, with tests) and three hard (a
// subtle bug whose cause is in more than one file). A hidden check (task-checks/<id>.py), which
// the arm never sees, runs after the arm with the project as its working directory, beside the
// project's own test suite; both must pass.

import type { Arm, Checked, Step, TaskCase } from '../../../bench/types'

export type Difficulty = 'trivial' | 'medium' | 'hard'
export type RoutingTask = TaskCase & { prompt: string; difficulty: Difficulty }

export const FIXTURE = 'src/features/routing/bench/task-fixture'
export const CHECKS = 'src/features/routing/bench/task-checks'
export const DIFFICULTIES: readonly Difficulty[] = ['trivial', 'medium', 'hard']

// what a person lets a coding session do in the scratch copy without asking
export const SESSION_TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'MultiEdit', 'Write', 'Bash(python3:*)', 'Bash(ls:*)', 'Bash(wc:*)',
  'Bash(grep:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(cat:*)', 'Bash(find:*)', 'Bash(git diff:*)', 'Bash(git status:*)']

const task = (id: string, difficulty: Difficulty, prompt: string): RoutingTask =>
  ({ id, difficulty, prompt, fixture: FIXTURE, git: true, fresh: true, setup: [], allowedTools: SESSION_TOOLS })

export const TASKS: RoutingTask[] = [
  task('typo-message', 'trivial',
    'When I quote to a postcode we don\'t serve, e.g. `python3 -m parcel quote --weight 1 --to 9990`, the error says "Unknwon zone". ' +
      'Can you fix that typo?'),
  task('rename-function', 'trivial',
    'Rename `calc_price` in parcel/rates.py to `freight_price`, and update everything that uses it: code, tests and the README.'),
  task('lb-conversion', 'trivial',
    '`python3 -m parcel quote --weight 10 --lb --to 6011` charges it as a 22.5 kg parcel. 10 lb is about 4.5 kg. Fix the conversion.'),
  task('lookup-quote', 'trivial',
    'Customer on the phone: a box 40 x 30 x 25 cm, 3.2 kg, going to postcode 7010. What do we charge them, GST included? ' +
      'Just tell me the amount; don\'t change any files.'),
  task('express-option', 'medium',
    'We\'re adding an express service. Give `quote()` in parcel/quote.py an `express` keyword (default False) and the `quote` ' +
      'command an `--express` flag. Express adds 40% to the freight only (not the rural delivery fee), rounded half up to the cent, ' +
      'before GST. Show it in the CLI output, and add tests for both.'),
  task('report-by-zone', 'medium',
    'Finance wants the monthly report split by zone. Add a `--by-zone` flag to `parcel report`: after the usual lines, print one ' +
      'line per zone that had parcels, in zone-letter order, exactly like `N: 4 parcels, $123.45` (that zone\'s total including GST). ' +
      'Without the flag the report stays as it is. Add tests.'),
  task('public-holidays', 'medium',
    'ETAs ignore public holidays. data/holidays.txt lists the NZ public holidays we don\'t deliver on (one ISO date per line, # for ' +
      'comments). Make the delivery estimate skip them the way it skips weekends, and have `parcel eta` use that file. Add tests. ' +
      'For example, a parcel booked Friday 23 October 2026 at 10am on 1-day service should arrive Tuesday the 27th, not Monday the ' +
      '26th (Labour Day).'),
  task('gst-rounding', 'hard',
    'Finance says our GST is sometimes a cent off from their spreadsheet. Example: `python3 -m parcel quote --weight 13.5 --to 6011` ' +
      'shows GST $6.70, and they get $6.71 (15% of the subtotal, rounded half up to the cent). The GST line on the monthly report ' +
      '(`python3 -m parcel report data/shipments.csv`) doesn\'t match the sum of the per-parcel GST either. Find the cause and fix it ' +
      'everywhere, with tests.'),
  task('weekend-eta', 'hard',
    'Two ETA complaints from customer service. The website, which calls estimate_delivery directly, promised a parcel booked ' +
      'Saturday 10 October at 10am on 1-day service for Monday the 12th; we don\'t pick up on weekends, so it should be Tuesday the ' +
      '13th. And `python3 -m parcel eta --booked "2026-10-08 16:30" --service 1` says Friday the 9th, but that booking is after the ' +
      '3pm cutoff, so it should be Monday the 12th. Find what\'s wrong and fix it, with regression tests.'),
  task('report-total', 'hard',
    'The report for data/shipments.csv says Total: $796.53, but finance quoted every parcel one by one with `parcel quote` (with ' +
      'each one\'s dimensions) and got $1489.06. The one-by-one quotes are right. Find out why the report comes out lower and fix ' +
      'the report, with a test.'),
]

/** What a unittest run printed at its end: how many tests ran and how many failed or erred. */
export function unittestCounts(output: string): { ran: number; failed: number } {
  const ran = /^Ran (\d+) tests? in/m.exec(output)
  const failed = /^FAILED \(([^)]*)\)/m.exec(output)
  let bad = 0
  for (const m of (failed?.[1] ?? '').matchAll(/(?:failures|errors|unexpected successes)=(\d+)/g)) bad += Number(m[1])
  return { ran: ran ? Number(ran[1]) : 0, failed: bad }
}

type Ran = { code: number | null; stdout: string; stderr: string }

/**
 * One arm's verdict: the project's own suite must pass and every hidden check too. The score is
 * the share of hidden checks passed (a check that could not run passes none).
 */
export function verdict(t: RoutingTask, suite: Ran, hidden: Ran): Checked {
  const s = unittestCounts(suite.stderr + suite.stdout)
  const h = unittestCounts(hidden.stderr + hidden.stdout)
  const passed = Math.max(0, h.ran - h.failed)
  const suiteOk = suite.code === 0 && s.ran > 0
  const hiddenOk = hidden.code === 0 && h.ran > 0 && h.failed === 0
  return { success: suiteOk && hiddenOk, score: h.ran ? passed / h.ran : 0,
    detail: { difficulty: t.difficulty, suite_ok: suiteOk, suite_tests: s.ran, checks_passed: passed, checks_ran: h.ran } }
}

// About what one task costs on Claude, for the estimate. The 2026-10-11 smoke (lb-conversion)
// cost $0.27 on Opus (about eight turns over Claude Code's ~30k-token system prompt, cached) and
// $0.10 routed to Haiku, which writes that prompt to its own cache first. Medium and hard work
// takes more turns. A routed arm is priced on the lane the task should get: Haiku for trivial
// work, Sonnet for medium, Opus for hard.
export const USD: Record<Difficulty, { plain: number; routed: number }> = {
  trivial: { plain: 0.3, routed: 0.1 },
  medium: { plain: 0.8, routed: 0.5 },
  hard: { plain: 1.5, routed: 1.5 },
}

/** One step per arm, the same prompt: what changes between arms is only routing. */
export const stepsFor = (t: RoutingTask, arm: Arm): Step[] =>
  [{ prompt: t.prompt, final: true, usd: USD[t.difficulty][arm.kind === 'jev-mod' ? 'routed' : 'plain'] }]

/** Routing off for plain Claude Code (every turn on Claude Code's default model and effort), on for jev-mod. */
export const overlayOf = (arm: Arm) => ({ features: { routing: { mode: arm.kind === 'jev-mod' ? 'on' : 'off' } } })
