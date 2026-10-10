# Trimming test logs: an offline benchmark

Output trimming judges a test run's passing and other blocks against the current goal
(`src/features/trim-output/testlog.ts`). This folder holds four test logs (vitest, jest, pytest,
go test), each with a goal and a gold set of lines that must survive, and a script that reports,
for each log, the share of lines cut and the gold lines lost, for two paths:

- **keep failures only**: a filter that keeps the failures and the summary and nothing else.
- **decision model**: the path trim-output takes: fold, split into blocks, one request, drop the
  blocks "not needed" is at least 90% likely for.

## Run it

```
bun evals/trim-tests/run.ts
```

This uses a fake decision model (a block is needed when it mentions a word of the goal). It sends
nothing anywhere and measures the pipeline, not a model. `src/features/trim-output/bench.test.ts`
runs the same code under `claude plugin test .` and holds the numbers.

## Run it against a real backend

Write a module whose default export answers one request: it gets the state and the questions the
extension would send, and returns, for each question name, the probability that its chunk is
needed.

```ts
// mine.ts
import { ask } from '../../src/engine/client'
import type { Decide } from '../../src/features/trim-output/bench'
const decide: Decide = async (state, questions) => {
  const reply = await ask(host, state, questions, { timeoutMs: 20_000, retries: 0 })  // host: a backend you set up
  return Object.fromEntries(Object.entries(reply.answers).map(([q, a]) => [q, a.type === 'noul' ? a.noul : 1]))
}
export default decide
```

then `bun evals/trim-tests/run.ts --decide ./mine.ts`. `host` is the same object `hostOf(io)`
gives the extension (see `src/core/host.ts`). A real run costs a few requests, one per log, and
counts against whatever key you give it; read the table for "gold lines lost" first: a good
decision model loses none and still cuts well over a third.

## Add a case

Add a function to `fixtures.ts` that returns a `Case`: the log, the command, the goal, and the
lines the goal needs. Gold lines are compared by trimmed text.
