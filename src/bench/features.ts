// The features that have a bench, and where each keeps its cases, results and plots. A new
// bench is one line here (README.md, "Write a bench").

import { adapter as browser } from '../features/browser/bench/adapter'
import { adapter as compact } from '../features/compact/bench/adapter'
import { task as compactTask } from '../features/compact/bench/task'
import { adapter as accessGate } from '../features/access-gate/bench/adapter'
import { adapter as reviewTriage } from '../features/review-triage/bench/adapter'
import { adapter as rulesGate } from '../features/rules-gate/bench/adapter'
import { adapter as screening } from '../features/screening/bench/adapter'
import { adapter as stopGate } from '../features/stop-gate/bench/adapter'
import { adapter as toolGate } from '../features/tool-gate/bench/adapter'
import { adapter as findFiles } from '../features/find-files/bench/adapter'
import { adapter as routing } from '../features/routing/bench/adapter'
import { adapter as rulesGate } from '../features/rules-gate/bench/adapter'
import { adapter as skills } from '../features/skills/bench/adapter'
import { adapter as trimOutput } from '../features/trim-output/bench/adapter'
import { adapter as webFilter } from '../features/web-filter/bench/adapter'
import type { DecisionAdapter, TaskAdapter } from './types'

export type Bench = { decision?: DecisionAdapter<any>; task?: TaskAdapter<any> }

export const BENCHES: Record<string, Bench> = {
  compact: { decision: compact, task: compactTask },
  'trim-output': { decision: trimOutput },
  'rules-gate': { decision: rulesGate },
  screening: { decision: screening },
  'web-filter': { decision: webFilter },
  'tool-gate': { decision: toolGate },
  'access-gate': { decision: accessGate },
  'stop-gate': { decision: stopGate },
  routing: { decision: routing },
  skills: { decision: skills },
  'find-files': { decision: findFiles },
  browser: { decision: browser },
  'review-triage': { decision: reviewTriage },
}

/** The feature's bench folder, relative to the repo root. */
export const benchDir = (feature: string) => `src/features/${feature}/bench`
/** Real results and their plots. */
export const resultsDir = (feature: string) => `${benchDir(feature)}/results`
/** The fake backend's example results and plots: never mistaken for real ones. */
export const fakeDir = (feature: string) => `${benchDir(feature)}/fake`
