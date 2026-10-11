# `/jev-mod compact`

A compaction with no summary: the decision model marks what to keep, and everything else is dropped.

There is no mode setting: it runs when you type it. `/compact` is left as Claude Code has it, unless its instructions are this compaction's marker (below).

## What it decides

For each message's text, and for each tool call together with its result, *keep* or *drop*. A call and its result always share one fate.

## When it runs

When you type `/jev-mod compact`. (A command's own hook may not compact, so it queues the built-in `/compact` from a timer and answers that one compaction instead of the summariser.)

Headless (`claude -p`), the process ends when the command returns, before that timer fires, so `/jev-mod compact` says so and nothing is compacted. There, send the same compaction in one step:

```bash
claude -p --resume <session> "/compact [jev-mod compact: drop only what Jev marks drop]"
```

A `/compact` typed with that marker as its instructions is answered the same way in any session. An automatic compaction, a subagent's, or a `/compact` with other instructions goes to Claude Code's summariser as usual.

## How it decides

- The decision model sees the tool, its main argument such as the command or file path, and the result's start and end, redacted and cut to under 700 characters, saying how much is not shown. Requests are packed by encoded size, up to 40 turns each.
- Keep means: a decision, a constraint, a user preference, an unfinished task, an exact value, path, id, command or error that later work depends on, or background whose gist later work needs. Drop means chatter, acknowledgements, superseded attempts, repeated output, or detail nothing later depends on.
- A message goes only when every part of it was judged drop with confidence of at least 0.7.
- Everything else stays: low-confidence drops, anything it did not judge (it was down, timed out, answered only part, or the text, call or result held something sensitive that is never sent), the last six messages, and both halves of any kept tool call.
- A note replaces what was removed, saying how many messages were kept and that nothing was summarised.
- Nothing is summarised.

## Settings

None.

## Failing open, privacy and budget

Nothing is removed when the decision model does not answer, when it marks no turn drop, or when today's budget is spent (one compaction is charged against it, its batches together). A toast says why. Text is redacted before it is sent.

## Limits

- Dropping is the one decision that cannot be undone, so doubt keeps.
- The tail (six messages) is always kept.
- A text with something sensitive is never judged, so it stays.

## Benchmarks

Two benches (src/bench/README.md). The decision level asks Jev about ten labelled sessions and sweeps the drop bar. The task level builds three long, real coding sessions in `bench/task-fixture/` (a bug fix, a feature, an investigation; about 105k tokens of conversation each), compacts a fork of each with `/compact`, with this compaction at each drop bar, and not at all, then asks what a continuation needs with every tool refused. In a bench run the compaction writes what it kept and dropped to the run's ledger; an arm whose question did not read a meaningfully smaller context, or that dropped nothing, is `not_compacted`, never a score. It is not run yet: one pass costs about $105 in Claude calls (`bun src/bench/run.ts compact --level task --backend <name> --sweep drop=0.6:0.9:0.1` prints the plan).

<!-- bench:start -->
**Bench** (`bun src/bench/report.ts compact`; 0.11.0@14f7f68, 0.11.0@40135d0).

- **One case:** a made-up coding session, each message labelled keep or drop by a careful person (keep: a decision, a constraint, an exact path or error; drop: chatter, superseded attempts).
- **Measured:** for each message outside the last six (always kept), whether Jev's keep or drop call matches the label. Dropping a message labelled keep is the costly mistake: it cannot be had back.
- **The setting:** how sure Jev must be that a message can go before /jev-mod compact drops it. Higher keeps more. (`drop`, default 0.5)

**Compared with plain Claude Code:**

![task](bench/results/task.svg)

| arm | runs | success | mean score | median time | total time | Claude cost | feature decision cost | other jev-mod decision cost | total cost |
|---|---|---|---|---|---|---|---|---|---|
| plain Claude Code | 1 | 100.0% | 100.0% | 97.0 s | 97.0 s | $6.783 | $0 | $0 | $6.783 |
| no compaction | 1 | 100.0% | 100.0% | 10.9 s | 10.9 s | $4.291 | $0 | $0 | $4.291 |
| jev-mod openrouter drop=0.6 | 1 (failed: 1 not_compacted) | – | – | – | 12.6 s | – | – | – | – |
| jev-mod openrouter drop=0.7 | 1 (failed: 1 not_compacted) | – | – | – | 12.8 s | – | – | – | – |
| jev-mod openrouter drop=0.8 | 1 (failed: 1 not_compacted) | – | – | – | 14.6 s | – | – | – | – |
| jev-mod openrouter drop=0.9 | 1 (failed: 1 not_compacted) | – | – | – | 15.4 s | – | – | – | – |

- success: the share of scored runs the checker marked right; mean score: its partial credit (the share of questions answered right, say).
- median time: over scored runs; total time: every run of the arm, failed ones too.
- costs are per scored run. Feature decision cost: what compact's own decisions cost; other jev-mod decision cost: what other jev-mod features still asked in the arm (a protective feature the bench may not switch off, as the person has it). Total cost is Claude plus both. A failed run is never scored.
- plain Claude Code runs with jev-mod switched off whole, so it makes no decisions; a plain run that shows any is an error (`decisions_in_plain_arm`). Runs from jev-mod 0.12.0 and before switched off only the features that change what the model sees.

- jev-mod openrouter drop=0.6: no scored run (1 not_compacted).
- jev-mod openrouter drop=0.7: no scored run (1 not_compacted).
- jev-mod openrouter drop=0.8: no scored run (1 not_compacted).
- jev-mod openrouter drop=0.9: no scored run (1 not_compacted).

| arm | question context | kept / dropped | Claude tokens |
|---|---|---|---|
| plain Claude Code | 41.0k | – | 41746 |
| no compaction | 176.5k | – | 177382 |
| jev-mod openrouter drop=0.6 | 187.0k | 138 / 6 of 144 | – |
| jev-mod openrouter drop=0.7 | 187.0k | 139 / 5 of 144 | – |
| jev-mod openrouter drop=0.8 | 187.0k | 143 / 1 of 144 | – |
| jev-mod openrouter drop=0.9 | 176.7k | 144 / 0 of 144 | – |

- question context: what the last step read, in tokens (a smaller one is a compaction that worked); kept / dropped: messages the compaction kept and dropped, of those before it.

Spend in all: $56.926 Claude, of which the shared setup $18.181 (1 case(s), 402.7 s); $0.00347 decisions. A failed run is never scored, but its spend counts here.

**Decision level.** Jev answers each case by itself, and the bench replays its answers at every value of `drop`. Best = where accuracy peaks; a tie goes to the higher value: a higher bar keeps more, and a dropped message cannot be had back.

**What this means.** At the default 0.5, Jev makes the same keep or drop call as the label on 88.7% of the messages in 10 sessions. No value in the sweep does better, so the default stays.

![accuracy](bench/results/accuracy.svg)
![effect](bench/results/effect.svg)
![cost-latency](bench/results/cost-latency.svg)

| backend · model | cases | best | accuracy | precision | recall | F1 | messages dropped | keep lost | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 10 | 0.5 | 88.7% | 100.0% | 76.1% | 86.4% | 35.8% | 0 | 474 ms | 710 ms | $0.00008 |

- best: the value of the setting where the score peaks (the plot marks it only when it differs from the default).
- accuracy: the share of items where acting or not acting matched the label.
- precision: when the feature acts, how often acting was right.
- recall: of what it should have acted on, how much it did.
- F1: precision and recall in one number.
- messages dropped: the share of items the feature acts on, at the best value.
- keep lost: messages labelled keep that were dropped: the costly mistake.
- p50, p95: how long a decision call took (the middle one, and the slow end); cost/case: what the decision calls cost per case.

Best per backend:

- openrouter · typesafe/jev-1.13-20260917: drop 0.5 (accuracy 88.7%; default 0.5: 88.7%)
<!-- bench:end -->
