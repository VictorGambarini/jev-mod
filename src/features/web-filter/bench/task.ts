// The web filter's task-level bench: a person asks Claude Code something that a long web page
// answers in a sentence or two, and Claude fetches it with WebFetch. Plain Claude Code (jev-mod
// switched off whole, as in every bench) reads whatever WebFetch returns; with jev-mod the web filter cuts the parts
// the question does not need before Claude reads it. The checker is the exact answer, so a filter
// that cuts the sentence it needed shows as a wrong answer; wall time, Claude's cost (what the
// model reads is most of it), the decision model's cost and the total are in the row.
//
// The pages are made up and served from 127.0.0.1 (bench/web-server.ts): WebFetch upgrades to
// https, so the run trusts a throwaway certificate. WebSearch cannot be served locally, so this
// bench covers the filter's fetch path only; its search path is judged at the decision level.
// WebFetch does not hand Claude the page: a small model summarises it for the prompt Claude gives,
// and it is that text the filter sees, so a result under `fetchMinChars` (4000) passes untouched.
// The prompt therefore asks for a section-by-section listing, which runs to 5,000-6,000 characters
// on these pages, and an arm whose filter was never asked is an error (`no_long_fetch`), not a score.

import { addresses } from '../../../bench/web-server-address'
import type { Arm, ArmRun, ArmSetup, Checked, Step, TaskAdapter, TaskCase } from '../../../bench/types'
import { FILTER_TASKS, type FilterTask } from './pages'

export type FilterCase = TaskCase & { task: FilterTask }

const FIXTURE = 'src/features/web-filter/bench/task-fixture'
const ASK = 'Go through the page section by section and, for every section, say who looks after it, which form is used and where the paper copies are kept; leave no section out.'

/** The user's prompt: where to look, how to ask WebFetch, and the question. */
export function promptFor(t: FilterTask, base: string): string {
  const urls = Object.keys(t.pages).map(path => `${base}${path}`)
  const where = urls.length === 1 ? `Fetch ${urls[0]} with WebFetch` : `Fetch ${urls.join(' and ')} with WebFetch`
  return `${where}, asking it: "${ASK}" Then answer this from what it returns: ${t.question} Reply with just the answer, in one or two lines.`
}

/** The answer is right when every pattern matches; the score is the share that do. */
export function check(t: FilterTask, text: string): Checked {
  const right = t.answer.map(p => p.test(text))
  const n = right.filter(Boolean).length
  return { success: n === right.length, score: n / right.length, detail: { right } }
}

/**
 * What needs the machine (the local site) is filled in by task-io.ts, so that this file and its
 * tests load without it: the site started for an arm, and what its Claude calls are given.
 */
export const io = {
  site: async (): Promise<ArmSetup> => { throw new Error('the web-filter task bench needs task-io.ts') },
}

export const task: TaskAdapter<FilterCase> = {
  feature: 'web-filter',
  cases: () => FILTER_TASKS.map(t => ({ id: t.id, fixture: FIXTURE, setup: [], allowedTools: ['WebFetch', 'Read'], task: t })),
  // each arm gets the site afresh, and trusts its certificate
  beforeArm: () => io.site(),
  steps(c): Step[] {
    // the https address is fixed before the site starts, so a plan can print the prompts
    return [{ prompt: promptFor(c.task, addresses().https), final: true, usd: 0.12 }]
  },
  overlay(arm) {
    const features: Record<string, Record<string, unknown>> = {}
    if (arm.kind === 'jev-mod') features['web-filter'] = { mode: 'on', ...(typeof arm.settings.minConfidence === 'number' ? { minConfidence: arm.settings.minConfidence } : {}) }
    return { features }
  },
  check: (c, text) => check(c.task, text),
  verify(_c: FilterCase, arm: Arm, run: ArmRun): string | null {
    // the filter only looks at a WebFetch result of 4000 characters or more
    return arm.kind === 'jev-mod' && !(run.byFeature['web-filter']?.requests ?? 0) ? 'no_long_fetch' : null
  },
  usdPerCall: 0.12,
  maxUsdPerCall: 1,
  // the screen and the filter each ask once per long fetch
  decisionCallsPerArm: 2,
  estimateNote: cases => [`  priced at about $0.12 an arm run: one or two WebFetch calls (a small model summarises each page) and an answer; ${cases.length} cases, no shared setup`],
}
