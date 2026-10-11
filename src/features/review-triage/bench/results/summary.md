# Review triage: bench summary

**Bench** (`bun src/bench/report.ts review-triage`; 0.11.0@14f7f68, 0.12.0@55065cf).

- **One case:** a change (a git diff) with its intent and the project's written rules, and whether it needs a full review or one quick pass is enough.
- **Measured:** whether Jev calls a change quick only when it is. Calling a change quick that needs a full review skips the review: that is the costly mistake. Calling a quick one full only costs time.
- **The setting:** how sure Jev must be, on every one of seven questions, that nothing is wrong before the change is called quick. Higher means fewer quick calls. (`minConfidence`, default 0.8)

**Compared with plain Claude Code:**

![task](task.svg)

| arm | runs | success | mean score | median time | total time | Claude cost | feature decision cost | other jev-mod decision cost | total cost |
|---|---|---|---|---|---|---|---|---|---|
| plain Claude Code | 10 | 60.0% | 81.6% | 9043 ms | 95.6 s | $0.090 | $0 | $0 | $0.090 |
| jev-mod openrouter told=0 | 10 (failed: 5 not_triaged) | 100.0% | 100.0% | 12.7 s | 119.6 s | $0.109 | $0.00013 | $0 | $0.109 |
| jev-mod openrouter told=1 | 10 | 80.0% | 95.5% | 12.4 s | 139.3 s | $0.099 | $0.00014 | $0.00003 | $0.100 |

- success: the share of scored runs the checker marked right; mean score: its partial credit (the share of questions answered right, say).
- median time: over scored runs; total time: every run of the arm, failed ones too.
- costs are per scored run. Feature decision cost: what review-triage's own decisions cost; other jev-mod decision cost: what other jev-mod features still asked in the arm (a protective feature the bench may not switch off, as the person has it). Total cost is Claude plus both. A failed run is never scored.
- plain Claude Code runs with jev-mod switched off whole, so it makes no decisions; a plain run that shows any is an error (`decisions_in_plain_arm`). Runs from jev-mod 0.12.0 and before switched off only the features that change what the model sees.

- jev-mod openrouter told=0: right on 100.0% (plain Claude Code 60.0%) of runs, median 12.7 s (plain Claude Code 9043 ms), $0.109 (plain Claude Code $0.090) per run (Claude $0.109, review-triage's decisions $0.00013, other jev-mod decisions $0).
- jev-mod openrouter told=1: right on 80.0% (plain Claude Code 60.0%) of runs, median 12.4 s (plain Claude Code 9043 ms), $0.100 (plain Claude Code $0.090) per run (Claude $0.099, review-triage's decisions $0.00014, other jev-mod decisions $0.00003).

| arm | question context | kept / dropped | Claude tokens |
|---|---|---|---|
| plain Claude Code | 58.8k | – | 59420 |
| jev-mod openrouter told=0 | 68.1k | – | 76026 |
| jev-mod openrouter told=1 | 67.8k | – | 68627 |

- question context: what the last step read, in tokens (a smaller one is a compaction that worked); kept / dropped: messages the compaction kept and dropped, of those before it.

Spend in all: $3.001 Claude; $0.00230 decisions. A failed run is never scored, but its spend counts here.

**Decision level.** Jev answers each case by itself, and the bench replays its answers at every value of `minConfidence`. Best = where accuracy peaks; a tie goes to the higher value: a higher bar answers quick less often, and a full review costs only time; a wrongly quick one skips a review.

**What this means.** At the default 0.8, Jev makes the right quick or full call on 84.3% of the 51 changes; at the best value found, 0.55, the same score is 94.1%. The shipped default (0.8) is not the best value found (0.55). Not yet changed.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | best | accuracy | precision | recall | F1 | changes called quick | full skipped | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 51 | 0.55 | 94.1% | 100.0% | 82.4% | 90.3% | 27.5% | 0 | 468 ms | 523 ms | $0.00004 |

- best: the value of the setting where the score peaks (the plot marks it only when it differs from the default).
- accuracy: the share of items where acting or not acting matched the label.
- precision: when the feature acts, how often acting was right.
- recall: of what it should have acted on, how much it did.
- F1: precision and recall in one number.
- changes called quick: the share of items the feature acts on, at the best value.
- full skipped: changes that needed a full review but were called quick.
- p50, p95: how long a decision call took (the middle one, and the slow end); cost/case: what the decision calls cost per case.

Best per backend:

- openrouter · typesafe/jev-1.13-20260917: minConfidence 0.55 (accuracy 94.1%; default 0.8: 84.3%)

