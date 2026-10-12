// The features that have a bench, and where each keeps its cases, results and plots. A new
// bench is one line here (README.md, "Write a bench").

import { adapter as accessGate } from '../features/access-gate/bench/adapter'
import { task as accessGateTask } from '../features/access-gate/bench/task'
import { adapter as browser } from '../features/browser/bench/adapter'
import { task as browserTask } from '../features/browser/bench/task'
import { adapter as compact } from '../features/compact/bench/adapter'
import { task as compactTask } from '../features/compact/bench/task'
import { adapter as findFiles } from '../features/find-files/bench/adapter'
import { task as findFilesTask } from '../features/find-files/bench/task'
import '../features/find-files/bench/task-sys' // its large project is cloned through it
import { adapter as reviewTriage } from '../features/review-triage/bench/adapter'
import { task as reviewTriageTask } from '../features/review-triage/bench/task-check'
import { adapter as routing } from '../features/routing/bench/adapter'
import { task as routingTask } from '../features/routing/bench/task'
import { adapter as rulesGate } from '../features/rules-gate/bench/adapter'
import { task as rulesGateTask } from '../features/rules-gate/bench/task'
import { adapter as screening } from '../features/screening/bench/adapter'
import { task as screeningTask } from '../features/screening/bench/task-io'
import { adapter as skills } from '../features/skills/bench/adapter'
import { task as skillsTask } from '../features/skills/bench/task'
import { adapter as stopGate } from '../features/stop-gate/bench/adapter'
import { task as stopGateTask } from '../features/stop-gate/bench/task'
import { adapter as toolGate } from '../features/tool-gate/bench/adapter'
import { task as toolGateTask } from '../features/tool-gate/bench/task'
import { adapter as trimOutput } from '../features/trim-output/bench/adapter'
import { task as trimOutputTask } from '../features/trim-output/bench/task-check'
import { adapter as webFilter } from '../features/web-filter/bench/adapter'
import { task as webFilterTask } from '../features/web-filter/bench/task-io'
import type { DecisionAdapter, TaskAdapter } from './types'

export type Bench = { decision?: DecisionAdapter<any>; task?: TaskAdapter<any> }

export const BENCHES: Record<string, Bench> = {
  compact: { decision: compact, task: compactTask },
  'trim-output': { decision: trimOutput, task: trimOutputTask },
  'rules-gate': { decision: rulesGate, task: rulesGateTask },
  screening: { decision: screening, task: screeningTask },
  'web-filter': { decision: webFilter, task: webFilterTask },
  'tool-gate': { decision: toolGate, task: toolGateTask },
  'access-gate': { decision: accessGate, task: accessGateTask },
  'stop-gate': { decision: stopGate, task: stopGateTask },
  routing: { decision: routing, task: routingTask },
  skills: { decision: skills, task: skillsTask },
  'find-files': { decision: findFiles, task: findFilesTask },
  browser: { decision: browser, task: browserTask },
  'review-triage': { decision: reviewTriage, task: reviewTriageTask },
}

/** The feature's bench folder, relative to the repo root. */
export const benchDir = (feature: string) => `src/features/${feature}/bench`
/** Real results and their plots. */
export const resultsDir = (feature: string) => `${benchDir(feature)}/results`
/** The fake backend's example results and plots: never mistaken for real ones. */
export const fakeDir = (feature: string) => `${benchDir(feature)}/fake`
