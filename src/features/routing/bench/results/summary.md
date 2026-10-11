# Routing: bench summary

**Bench** (`bun src/bench/report.ts routing`; 0.11.0@14f7f68, 0.12.0@55065cf).

- **One case:** a prompt a person might type to Claude Code, and the lane (small, medium, high, escalate) the lane policy says suits it.
- **Measured:** whether Jev routes the prompt to exactly that lane. Too low a lane gives the work a cheaper model than it needs; too high wastes money.
- **The setting:** how sure Jev must be that a prompt is simple before it goes to the cheapest model. Higher sends fewer prompts there. (`smallConfidence`, default 0.7)

**Compared with plain Claude Code:**

![task](task.svg)

| arm | runs | success | mean score | median time | total time | Claude cost | feature decision cost | other jev-mod decision cost | total cost |
|---|---|---|---|---|---|---|---|---|---|
| plain Claude Code | 10 | 90.0% | 96.7% | 41.4 s | 358.7 s | $0.217 | $0 | $0 | $0.217 |
| jev-mod openrouter | 10 | 90.0% | 96.7% | 26.4 s | 260.2 s | $0.089 | $0.00003 | $0.00015 | $0.089 |

- success: the share of scored runs the checker marked right; mean score: its partial credit (the share of questions answered right, say).
- median time: over scored runs; total time: every run of the arm, failed ones too.
- costs are per scored run. Feature decision cost: what routing's own decisions cost; other jev-mod decision cost: what other jev-mod features still asked in the arm (a protective feature the bench may not switch off, as the person has it). Total cost is Claude plus both. A failed run is never scored.
- plain Claude Code runs with jev-mod switched off whole, so it makes no decisions; a plain run that shows any is an error (`decisions_in_plain_arm`). Runs from jev-mod 0.12.0 and before switched off only the features that change what the model sees.

- jev-mod openrouter: right on 90.0% (plain Claude Code 90.0%) of runs, median 26.4 s (plain Claude Code 41.4 s), $0.089 (plain Claude Code $0.217) per run (Claude $0.089, routing's decisions $0.00003, other jev-mod decisions $0.00015).

| arm | question context | kept / dropped | Claude tokens |
|---|---|---|---|
| plain Claude Code | 158.2k | – | 161851 |
| jev-mod openrouter | 160.2k | – | 163001 |

- question context: what the last step read, in tokens (a smaller one is a compaction that worked); kept / dropped: messages the compaction kept and dropped, of those before it.

Spend in all: $3.055 Claude; $0.00181 decisions. A failed run is never scored, but its spend counts here.

**By difficulty**, and which models Claude's spend went to:

| difficulty | arm | success | Claude $/task | decision $/task | total $/task | wall s/task | Claude spend by model |
|---|---|---|---|---|---|---|---|
| trivial | claude | 4/4 | $0.116 | $0.00 | $0.116 | 14 | opus 100% |
| trivial | jev-mod openrouter | 4/4 | $0.058 | $0.00010 | $0.058 | 18 | sonnet 54%, haiku 46% |
| medium | claude | 2/3 | $0.298 | $0.00 | $0.298 | 56 | opus 100% |
| medium | jev-mod openrouter | 2/3 | $0.124 | $0.00021 | $0.124 | 36 | sonnet 100% |
| hard | claude | 3/3 | $0.270 | $0.00 | $0.270 | 45 | opus 100% |
| hard | jev-mod openrouter | 3/3 | $0.094 | $0.00026 | $0.094 | 26 | sonnet 100% |
| all | claude | 9/10 | $0.217 | $0.00 | $0.217 | 36 | opus 100% |
| all | jev-mod openrouter | 9/10 | $0.089 | $0.00018 | $0.089 | 26 | sonnet 88%, haiku 12% |

| case | difficulty | arm | success | score | Claude $ | decision $ | wall s | models |
|---|---|---|---|---|---|---|---|---|
| typo-message | trivial | claude | yes | 1.00 | $0.095 | $0.00 | 11 | opus |
| typo-message | trivial | jev-mod openrouter | yes | 1.00 | $0.055 | $0.00017 | 17 | haiku |
| rename-function | trivial | claude | yes | 1.00 | $0.161 | $0.00 | 21 | opus |
| rename-function | trivial | jev-mod openrouter | yes | 1.00 | $0.077 | $0.00003 | 17 | sonnet |
| lb-conversion | trivial | claude | yes | 1.00 | $0.113 | $0.00 | 14 | opus |
| lb-conversion | trivial | jev-mod openrouter | yes | 1.00 | $0.053 | $0.00016 | 31 | haiku |
| lookup-quote | trivial | claude | yes | 1.00 | $0.095 | $0.00 | 10 | opus |
| lookup-quote | trivial | jev-mod openrouter | yes | 1.00 | $0.047 | $0.00003 | 8 | sonnet |
| express-option | medium | claude | no | 0.67 | $0.267 | $0.00 | 51 | opus |
| express-option | medium | jev-mod openrouter | no | 0.67 | $0.136 | $0.00030 | 41 | sonnet |
| report-by-zone | medium | claude | yes | 1.00 | $0.226 | $0.00 | 44 | opus |
| report-by-zone | medium | jev-mod openrouter | yes | 1.00 | $0.140 | $0.00017 | 41 | sonnet |
| public-holidays | medium | claude | yes | 1.00 | $0.401 | $0.00 | 73 | opus |
| public-holidays | medium | jev-mod openrouter | yes | 1.00 | $0.097 | $0.00017 | 27 | sonnet |
| gst-rounding | hard | claude | yes | 1.00 | $0.252 | $0.00 | 41 | opus |
| gst-rounding | hard | jev-mod openrouter | yes | 1.00 | $0.091 | $0.00018 | 24 | sonnet |
| weekend-eta | hard | claude | yes | 1.00 | $0.287 | $0.00 | 46 | opus |
| weekend-eta | hard | jev-mod openrouter | yes | 1.00 | $0.097 | $0.00034 | 28 | sonnet |
| report-total | hard | claude | yes | 1.00 | $0.272 | $0.00 | 47 | opus |
| report-total | hard | jev-mod openrouter | yes | 1.00 | $0.094 | $0.00026 | 26 | sonnet |

**Decision level.** Jev answers each case by itself, and the bench replays its answers at every value of `smallConfidence`. Best = where accuracy peaks; a tie goes to the higher value: a higher bar sends fewer prompts to the cheapest model; the cost of a miss is a small model on work that needed more.

**What this means.** At the default 0.7, Jev picks the exact lane on 81.5% of the 81 prompts. No value in the sweep does better, so the default stays.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | best | accuracy | precision | recall | F1 | prompts routed to small | under-routed | over-routed | not routed | effort right | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 81 | 0.7 | 81.5% | 100.0% | 75.0% | 85.7% | 22.2% | 0.082 | 0.096 | 0.025 | 0.863 | 471 ms | 550 ms | $0.00003 |

- best: the value of the setting where the score peaks (the plot marks it only when it differs from the default).
- accuracy: the share of items where acting or not acting matched the label.
- precision: when the feature acts, how often acting was right.
- recall: of what it should have acted on, how much it did.
- F1: precision and recall in one number.
- prompts routed to small: the share of items the feature acts on, at the best value.
- under-routed: an extra measure, at the best value.
- over-routed: an extra measure, at the best value.
- not routed: an extra measure, at the best value.
- effort right: an extra measure, at the best value.
- p50, p95: how long a decision call took (the middle one, and the slow end); cost/case: what the decision calls cost per case.

Best per backend:

- openrouter · typesafe/jev-1.13-20260917: smallConfidence 0.7 (accuracy 81.5%; default 0.7: 81.5%)

