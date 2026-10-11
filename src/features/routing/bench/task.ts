// Routing's task-level bench: ten real coding prompts of mixed difficulty in parcelkit
// (task-fixture/), each run once per arm with `claude -p` in a fresh copy of the project.
//
//   arms: plain Claude Code (routing off: every turn on Claude Code's default model and effort)
//         and jev-mod with routing on (the lane Jev reads from the prompt sets the model and effort)
//
// The checker runs the project's own tests and the case's hidden check (task-checks/<id>.py) on
// the arm's copy; the final answer is the hidden check's stdin (the lookup case reads it). Each
// row names the models that answered (claude -p's modelUsage), so a routed arm shows the model
// its lane picked, and holds Claude's cost, the decision model's cost and the wall time.
// task-cases.ts holds the cases and the scoring, pure; this file runs python3.

import { proc, repoRoot, run } from '../../../bench/node'
import type { TaskAdapter } from '../../../bench/types'
import { CHECKS, DIFFICULTIES, overlayOf, stepsFor, TASKS, USD, verdict, type RoutingTask } from './task-cases'

const PY = { env: { ...proc.env, PYTHONDONTWRITEBYTECODE: '1' }, timeoutMs: 120_000 }

export const task: TaskAdapter<RoutingTask> = {
  feature: 'routing',
  cases: () => TASKS,
  steps: stepsFor,
  overlay: overlayOf,
  async check(t, finalText, workdir) {
    const suite = await run('python3', ['-B', '-m', 'unittest', 'discover', '-s', 'tests', '-t', '.'], { cwd: workdir, ...PY })
    const hidden = await run('python3', ['-B', `${repoRoot()}/${CHECKS}/${t.id}.py`], { cwd: workdir, input: finalText, ...PY })
    return verdict(t, suite, hidden)
  },
  usdPerCall: 1,
  // a hard case on Opus may take many turns
  maxUsdPerCall: 5,
  // one lane request per prompt
  decisionCallsPerArm: 1,
  estimateNote: cases => DIFFICULTIES.map(d => {
    const mine = cases.filter(c => (c as RoutingTask).difficulty === d)
    return mine.length ? `  ${d}: ${mine.length} case(s), about $${USD[d].plain.toFixed(2)} each on plain Claude Code (Opus), ` +
      `$${USD[d].routed.toFixed(2)} routed (${d === 'trivial' ? 'Haiku' : d === 'medium' ? 'Sonnet' : 'Opus'})` : ''
  }).filter(Boolean),
}
