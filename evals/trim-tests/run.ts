// Offline benchmark for trimming test logs. See README.md in this folder.
//
//   bun evals/trim-tests/run.ts                       # fake decision model, no network
//   bun evals/trim-tests/run.ts --decide ./mine.ts    # your decision function (a real backend)

import { fakeDecide, keepFailuresOnly, table, withDecisionModel, type Decide } from '../../src/features/trim-output/bench'
import { CASES } from './fixtures'

declare const process: { argv: string[]; cwd(): string }

const flag = process.argv.indexOf('--decide')
const decide: Decide = flag > 0 ? (await import(new URL(process.argv[flag + 1]!, `file://${process.cwd()}/`).href)).default : fakeDecide

console.log(table('keep failures only', CASES.map(keepFailuresOnly)))
console.log()
console.log(table(flag > 0 ? 'decision model (yours)' : 'decision model (fake backend)', await Promise.all(CASES.map(c => withDecisionModel(c, decide)))))
