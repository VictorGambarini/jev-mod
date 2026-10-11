# /jev-mod compact: bench summary

**Bench** (`bun src/bench/report.ts compact`; 0.11.0@14f7f68, 0.11.0@40135d0).

- **One case:** a made-up coding session, each message labelled keep or drop by a careful person (keep: a decision, a constraint, an exact path or error; drop: chatter, superseded attempts).
- **Measured:** for each message outside the last six (always kept), whether Jev's keep or drop call matches the label. Dropping a message labelled keep is the costly mistake: it cannot be had back.
- **The setting:** how sure Jev must be that a message can go before /jev-mod compact drops it. Higher keeps more. (`drop`, default 0.5)

**Compared with plain Claude Code:**

![task](task.svg)

| arm | runs | success | mean score | median time | total time | Claude cost | decision cost | total cost |
|---|---|---|---|---|---|---|---|---|
| plain Claude Code | 1 | 100.0% | 100.0% | 97.0 s | 97.0 s | $6.783 | $0 | $6.783 |
| no compaction | 1 | 100.0% | 100.0% | 10.9 s | 10.9 s | $4.291 | $0 | $4.291 |
| jev-mod openrouter drop=0.6 | 1 (failed: 1 not_compacted) | – | – | – | 12.6 s | – | – | – |
| jev-mod openrouter drop=0.7 | 1 (failed: 1 not_compacted) | – | – | – | 12.8 s | – | – | – |
| jev-mod openrouter drop=0.8 | 1 (failed: 1 not_compacted) | – | – | – | 14.6 s | – | – | – |
| jev-mod openrouter drop=0.9 | 1 (failed: 1 not_compacted) | – | – | – | 15.4 s | – | – | – |

- success: the share of scored runs the checker marked right; mean score: its partial credit (the share of questions answered right, say).
- median time: over scored runs; total time: every run of the arm, failed ones too.
- costs are per scored run; total cost is Claude plus the decision model. A failed run is never scored.

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

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

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

