# Access gate: bench summary

**Bench** (`bun src/bench/report.ts access-gate`; 0.11.0@14f7f68, 0.12.0@55065cf).

- **One case:** a tool call (a shell command, a file read, a web fetch) with what this session has already allowed, and the answer a careful person would give: refuse it or let it through.
- **Measured:** the gate reads each call locally with patterns (no decision model), so this checks its pattern reading. Letting a call reach another machine or read a key is the costly miss; refusing local work is the annoying one.
- **The setting:** there is none: the gate has no confidence bar, every answer is refuse or allow, so the plot is one point.

**Compared with plain Claude Code:**

![task](task.svg)

| arm | runs | success | mean score | median time | total time | Claude cost | feature decision cost | other jev-mod decision cost | total cost |
|---|---|---|---|---|---|---|---|---|---|
| plain Claude Code | 8 | 100.0% | 100.0% | 12.7 s | 119.8 s | $0.095 | $0 | $0 | $0.095 |
| jev-mod openrouter | 8 | 87.5% | 93.8% | 11.2 s | 108.2 s | $0.111 | $0 | $0.00002 | $0.111 |

- success: the share of scored runs the checker marked right; mean score: its partial credit (the share of questions answered right, say).
- median time: over scored runs; total time: every run of the arm, failed ones too.
- costs are per scored run. Feature decision cost: what access-gate's own decisions cost; other jev-mod decision cost: what other jev-mod features still asked in the arm (a protective feature the bench may not switch off, as the person has it). Total cost is Claude plus both. A failed run is never scored.
- plain Claude Code runs with jev-mod switched off whole, so it makes no decisions; a plain run that shows any is an error (`decisions_in_plain_arm`). Runs from jev-mod 0.12.0 and before switched off only the features that change what the model sees.

- jev-mod openrouter: right on 87.5% (plain Claude Code 100.0%) of runs, median 11.2 s (plain Claude Code 12.7 s), $0.111 (plain Claude Code $0.095) per run (Claude $0.111, access-gate's decisions $0, other jev-mod decisions $0.00002).

| arm | question context | kept / dropped | Claude tokens |
|---|---|---|---|
| plain Claude Code | 73.7k | – | 74780 |
| jev-mod openrouter | 66.3k | – | 67149 |

- question context: what the last step read, in tokens (a smaller one is a compaction that worked); kept / dropped: messages the compaction kept and dropped, of those before it.

Spend in all: $1.649 Claude; $0.00014 decisions. A failed run is never scored, but its spend counts here.

**Decision level.** Jev answers each case by itself, and the bench replays its answers at every value of `none`. Best = where accuracy peaks; a tie goes to the higher value: there is no threshold: the gate reads each call locally and every answer is 0 or 1.

**What this means.** the gate gives the answer a careful person would on 97.4% of the 117 calls.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | best | accuracy | precision | recall | F1 | calls refused | blocked in error | missed | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · ~typesafe/jev-latest | 117 | 1 | 97.4% | 100.0% | 96.0% | 98.0% | 61.5% | 0 | 3 | – | – | $0 |

- best: the value of the setting where the score peaks (the plot marks it only when it differs from the default).
- accuracy: the share of items where acting or not acting matched the label.
- precision: when the feature acts, how often acting was right.
- recall: of what it should have acted on, how much it did.
- F1: precision and recall in one number.
- calls refused: the share of items the feature acts on, at the best value.
- blocked in error: an extra measure, at the best value.
- missed: an extra measure, at the best value.
- p50, p95: how long a decision call took (the middle one, and the slow end); cost/case: what the decision calls cost per case.

Best per backend:

- openrouter · ~typesafe/jev-latest: none 1 (accuracy 97.4%; default 1: 97.4%)

