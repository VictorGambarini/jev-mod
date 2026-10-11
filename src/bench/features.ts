// The features that have a bench, and where each keeps its cases, results and plots. A new
// bench is one line here (README.md, "Write a bench").

import { adapter as compact } from '../features/compact/bench/adapter'
import { task as compactTask } from '../features/compact/bench/task'
import { adapter as findFiles } from '../features/find-files/bench/adapter'
import { adapter as routing } from '../features/routing/bench/adapter'
import { adapter as rulesGate } from '../features/rules-gate/bench/adapter'
import { adapter as skills } from '../features/skills/bench/adapter'
import { adapter as trimOutput } from '../features/trim-output/bench/adapter'
import type { DecisionAdapter, TaskAdapter } from './types'

export type Bench = { decision?: DecisionAdapter<any>; task?: TaskAdapter<any> }

export const BENCHES: Record<string, Bench> = {
  compact: { decision: compact, task: compactTask },
  'trim-output': { decision: trimOutput },
  'rules-gate': { decision: rulesGate },
  routing: { decision: routing },
  skills: { decision: skills },
  'find-files': { decision: findFiles },
}

/** The feature's bench folder, relative to the repo root. */
export const benchDir = (feature: string) => `src/features/${feature}/bench`
/** Real results and their plots. */
export const resultsDir = (feature: string) => `${benchDir(feature)}/results`
/** The fake backend's example results and plots: never mistaken for real ones. */
export const fakeDir = (feature: string) => `${benchDir(feature)}/fake`
