// An offline benchmark for test-log trimming: how much of a log is cut, and how many of the
// lines the goal needs are lost with it. Plain functions: adapter.ts runs them under the bench
// harness (src/bench/README.md) and pipeline.test.ts holds the numbers.
//
// Two paths are measured on each case:
//   keep-failures-only   what a plain filter does: failures and the summary, nothing else
//   decision model       the path trim-output takes: fold, split into blocks, one request,
//                        drop the blocks "not needed" is at least 90% likely for
// The decision model is a `Decide`: a fake in the tests, a real backend through the bench
// (`bun src/bench/run.ts trim-output --backend <name>`).

import type { Question } from '../../../engine/client'
import * as tests from '../testlog'
import { chunkText, fold, linesOf, render, request, drop } from '../trim'

/** Answers each question of one request with the probability that its chunk is needed. */
export type Decide = (state: Record<string, unknown>, questions: Record<string, Question>) => Promise<Record<string, number>>

export type BenchCase = { name: string; command: string; goal: string; log: string; gold: string[] }
export type Result = { name: string; lines: number; keptLines: number; cutPercent: number; goldTotal: number; goldLost: string[]; kept: string[] }

const PATH = '<archive>'

function score(c: BenchCase, kept: string[]): Result {
  const lines = linesOf(c.log).length
  const have = new Set(kept.map(l => l.trim()))
  const lost = c.gold.filter(g => !have.has(g.trim()))
  return {
    name: c.name, lines, keptLines: kept.length, cutPercent: Math.round(100 * (1 - kept.length / lines)),
    goldTotal: c.gold.length, goldLost: lost, kept,
  }
}

/** The failures and the summary of a test log, and nothing else. */
export function keepFailuresOnly(c: BenchCase): Result {
  const lines = linesOf(c.log)
  const log = tests.parse(lines, c.command)
  if (!log) throw new Error(`${c.name}: not recognised as a test log`)
  const kept = log.blocks.filter(b => b.kind === 'fail' || b.kind === 'summary').flatMap(b => lines.slice(b.start, b.end + 1))
  return score(c, kept)
}

/** The trim-output path up to its one request: the folded rows, the chunks, and what would be asked. */
export function prepare(c: BenchCase) {
  const lines = linesOf(c.log)
  const log = tests.parse(lines, c.command)
  if (!log) throw new Error(`${c.name}: not recognised as a test log`)
  const rows = fold(lines)
  const chunks = tests.chunks(rows, log)
  const texts = new Map<number, string>()
  chunks.forEach((ch, id) => { if (!ch.keep) texts.set(id, chunkText(rows, ch)) })
  const ids = tests.oneRequest(texts, text => text.length + 16)
  const asked = ids.length ? request(c.goal, c.command, texts, ids) : null
  return { lines, rows, chunks, ids, asked }
}

/**
 * The trimmed output for a case given the decision model's answers (each chunk's probability
 * that it is needed): a chunk goes when "not needed" is at least `notNeeded` (the feature's 0.9).
 */
export function apply(c: BenchCase, answers: Record<string, number>, notNeeded = tests.NOT_NEEDED): Result & { asked: number } {
  const { lines, rows, chunks, ids } = prepare(c)
  let out = rows
  if (ids.length) {
    const sure = new Map<number, number>()
    for (const id of ids) {
      const p = answers[`c${id}`]
      if (typeof p === 'number') sure.set(id, 1 - p >= notNeeded - 1e-9 ? 0 : 1)
    }
    out = drop(rows, chunks, sure, 0.5)
  }
  const kept = render(out, lines.length, PATH).split('\n').slice(1)
  return { ...score(c, kept), asked: ids.length, kept }
}

/** The trim-output path with `decide` as the decision model. */
export async function withDecisionModel(c: BenchCase, decide: Decide): Promise<Result & { asked: number; requests: number }> {
  const { asked } = prepare(c)
  const answers = asked ? await decide(asked.state, asked.questions) : {}
  return { ...apply(c, answers), requests: asked ? 1 : 0 }
}

// ── the fake decision model ──────────────────────────────────────────────────

const STOP = new Set(['about', 'also', 'check', 'does', 'fail', 'failing', 'failure', 'fails', 'still', 'tell', 'test', 'tests', 'that',
  'their', 'then', 'what', 'whether', 'which', 'with', 'want', 'pass', 'passes', 'again', 'other', 'suite', 'warn', 'warns', 'run'])

/** Words of five letters or more from the goal and the command, minus a few that name every test run. */
export function goalWords(goal: string, command: string): string[] {
  return [...new Set(`${goal} ${command}`.toLowerCase().match(/[a-z]{5,}/g) ?? [])].filter(w => !STOP.has(w))
}

/**
 * A stand-in for the decision model: a chunk is needed (0.97) when it mentions a word of the
 * goal, and not needed (0.02) otherwise. It tests the pipeline, not a model.
 */
export const fakeDecide: Decide = async (state, questions) => {
  const words = goalWords(String(state.goal), String(state.command))
  const chunks = state.chunks as Record<string, string>
  return Object.fromEntries(Object.keys(questions).map(q => {
    const text = (chunks[`C${q.slice(1)}`] ?? '').toLowerCase()
    return [q, words.some(w => text.includes(w)) ? 0.97 : 0.02]
  }))
}

export function table(title: string, results: readonly Result[]): string {
  const rows = results.map(r => `${r.name.padEnd(10)} ${String(r.lines).padStart(5)} ${String(r.keptLines).padStart(5)} ${(r.cutPercent + '%').padStart(5)}   ${r.goldTotal - r.goldLost.length}/${r.goldTotal}`)
  const lost = results.reduce((n, r) => n + r.goldLost.length, 0)
  const total = results.reduce((n, r) => n + r.goldTotal, 0)
  const cut = Math.round(results.reduce((n, r) => n + r.cutPercent, 0) / results.length)
  return [title, 'case       lines  kept   cut    gold kept', ...rows, `mean cut ${cut}%; gold lines lost ${lost} of ${total}`].join('\n')
}
