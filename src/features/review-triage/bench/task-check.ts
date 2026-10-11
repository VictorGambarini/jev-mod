// review-triage's task checker: it reads the changed files to find the gold lines, so it lives
// apart from task.ts (the mod's test environment cannot load bench/node.ts).

import type { Checked } from '../../../bench/types'
import { fs } from '../../../bench/node'
import { checkedOf, findingsOf, linesWith, scoreFindings, taskAdapter, type ReviewTask, type Span, type Spot } from './task'

/** A spot's lines in the work folder's changed file; an error when its needle is not there exactly once. */
export async function spanOf(work: string, s: Spot): Promise<Span> {
  const f = await fs()
  const text = await f.readFile(`${work}/${s.file}`, 'utf8')
  const at = linesWith(text, s.needle)
  if (at.length !== 1) throw new Error(`${s.id}: ${s.needle} is on ${at.length} lines of ${s.file}, not one`)
  return { id: s.id, file: s.file, from: at[0]! - (s.before ?? 0), to: at[0]! + (s.after ?? 0) }
}

export async function checkWork(t: ReviewTask, finalText: string, work: string): Promise<Checked> {
  const bugs = await Promise.all(t.bugs.map(s => spanOf(work, s)))
  const tolerated = await Promise.all(t.tolerated.map(s => spanOf(work, s)))
  const { found, unreadable } = findingsOf(finalText)
  return checkedOf(scoreFindings(found, unreadable, bugs, tolerated), t.bugs.length)
}

export const task = taskAdapter(checkWork)
