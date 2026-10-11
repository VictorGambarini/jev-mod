# Screening: bench summary

**Bench** (`bun src/bench/report.ts screening`; 0.11.0@14f7f68, 0.12.0@55065cf).

- **One case:** a tool result (a fetched page, a search reply, an MCP result), cut into passages, each labelled: carries instructions aimed at an AI assistant (withhold it) or does not.
- **Measured:** whether Jev withholds the passages that hold injected instructions and lets the rest through. Reading an injection is the costly mistake; withholding harmless text costs little.
- **The setting:** how likely Jev must find a passage to be an injection before it is withheld. Lower withholds more. (`injection`, default 0.5)

**Compared with plain Claude Code:**

![task](task.svg)

| arm | runs | success | mean score | median time | total time | Claude cost | feature decision cost | other jev-mod decision cost | total cost |
|---|---|---|---|---|---|---|---|---|---|
| plain Claude Code | 10 | 100.0% | 100.0% | 6296 ms | 76.2 s | $0.063 | $0 | $0 | $0.063 |
| jev-mod openrouter | 10 | 50.0% | 75.0% | 10.5 s | 295.5 s | $0.145 | $0.00005 | $0 | $0.145 |

- success: the share of scored runs the checker marked right; mean score: its partial credit (the share of questions answered right, say).
- median time: over scored runs; total time: every run of the arm, failed ones too.
- costs are per scored run. Feature decision cost: what screening's own decisions cost; other jev-mod decision cost: what other jev-mod features still asked in the arm (a protective feature the bench may not switch off, as the person has it). Total cost is Claude plus both. A failed run is never scored.
- plain Claude Code runs with jev-mod switched off whole, so it makes no decisions; a plain run that shows any is an error (`decisions_in_plain_arm`). Runs from jev-mod 0.12.0 and before switched off only the features that change what the model sees.

- jev-mod openrouter: right on 50.0% (plain Claude Code 100.0%) of runs, median 10.5 s (plain Claude Code 6296 ms), $0.145 (plain Claude Code $0.063) per run (Claude $0.145, screening's decisions $0.00005, other jev-mod decisions $0).

| arm | question context | kept / dropped | Claude tokens |
|---|---|---|---|
| plain Claude Code | 43.5k | – | 43717 |
| jev-mod openrouter | 106.3k | – | 107713 |

- question context: what the last step read, in tokens (a smaller one is a compaction that worked); kept / dropped: messages the compaction kept and dropped, of those before it.

Spend in all: $2.084 Claude; $0.00048 decisions. A failed run is never scored, but its spend counts here.

**Decision level.** Jev answers each case by itself, and the bench replays its answers at every value of `injection`. Best = where accuracy peaks; a tie goes to the lower value: a lower bar withholds more, and a withheld harmless passage costs less than an injection the model reads.

**What this means.** At the default 0.5, Jev withholds or passes the right passages on 91.2% of the passages over 57 tool results; at the best value found, 0.65, the same score is 94.7%. The shipped default (0.5) is not the best value found (0.65). Not yet changed.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | best | accuracy | precision | recall | F1 | texts withheld | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 57 | 0.65 | 94.7% | 100.0% | 87.0% | 93.0% | 35.1% | 452 ms | 525 ms | $0.00001 |

- best: the value of the setting where the score peaks (the plot marks it only when it differs from the default).
- accuracy: the share of items where acting or not acting matched the label.
- precision: when the feature acts, how often acting was right.
- recall: of what it should have acted on, how much it did.
- F1: precision and recall in one number.
- texts withheld: the share of items the feature acts on, at the best value.
- p50, p95: how long a decision call took (the middle one, and the slow end); cost/case: what the decision calls cost per case.

Best per backend:

- openrouter · typesafe/jev-1.13-20260917: injection 0.65 (accuracy 94.7%; default 0.5: 91.2%)

