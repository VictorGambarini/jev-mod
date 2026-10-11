# Tool-call gate: bench summary

**Bench** (`bun src/bench/report.ts tool-gate`; 0.11.0@14f7f68, 0.12.0@55065cf).

- **One case:** a tool call (a command, an edit, a web request), what the person asked before it, and whether it should be put to the person first.
- **Measured:** whether Jev holds the calls that nothing asked for and are hard to undo or send data off the machine, or that break a stated limit, and lets the rest through. A held call costs the person a question; a missed hold is the costly mistake.
- **The setting:** how sure Jev must be before a call is held for the person. It is used two ways, so the curve is not smooth. (`minConfidence`, default 0.8)

**Compared with plain Claude Code:**

![task](task.svg)

| arm | runs | success | mean score | median time | total time | Claude cost | feature decision cost | other jev-mod decision cost | total cost |
|---|---|---|---|---|---|---|---|---|---|
| plain Claude Code | 9 | 88.9% | 94.4% | 17.2 s | 165.4 s | $0.112 | $0 | $0 | $0.112 |
| jev-mod openrouter | 9 | 77.8% | 88.9% | 16.7 s | 175.6 s | $0.115 | $0.00001 | $0.00008 | $0.115 |

- success: the share of scored runs the checker marked right; mean score: its partial credit (the share of questions answered right, say).
- median time: over scored runs; total time: every run of the arm, failed ones too.
- costs are per scored run. Feature decision cost: what tool-gate's own decisions cost; other jev-mod decision cost: what other jev-mod features still asked in the arm (a protective feature the bench may not switch off, as the person has it). Total cost is Claude plus both. A failed run is never scored.
- plain Claude Code runs with jev-mod switched off whole, so it makes no decisions; a plain run that shows any is an error (`decisions_in_plain_arm`). Runs from jev-mod 0.12.0 and before switched off only the features that change what the model sees.

- jev-mod openrouter: right on 77.8% (plain Claude Code 88.9%) of runs, median 16.7 s (plain Claude Code 17.2 s), $0.115 (plain Claude Code $0.112) per run (Claude $0.115, tool-gate's decisions $0.00001, other jev-mod decisions $0.00008).

| arm | question context | kept / dropped | Claude tokens |
|---|---|---|---|
| plain Claude Code | 100.5k | – | 101663 |
| jev-mod openrouter | 104.2k | – | 105529 |

- question context: what the last step read, in tokens (a smaller one is a compaction that worked); kept / dropped: messages the compaction kept and dropped, of those before it.

Spend in all: $2.045 Claude; $0.00085 decisions. A failed run is never scored, but its spend counts here.

**Decision level.** Jev answers each case by itself, and the bench replays its answers at every value of `minConfidence`. Best = where accuracy peaks; a tie goes to the higher value: a higher bar holds more hard-to-undo calls nothing asked for, and a held call only costs a question to the person; it holds fewer calls on a stated limit.

**What this means.** At the default 0.8, Jev makes the right hold or allow call on 92.8% of the 83 calls. No value in the sweep does better, so the default stays.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | best | accuracy | precision | recall | F1 | calls held | held in error | missed holds | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 83 | 0.8 | 92.8% | 97.1% | 87.2% | 91.9% | 42.2% | 1 | 5 | 469 ms | 528 ms | $0.00002 |

- best: the value of the setting where the score peaks (the plot marks it only when it differs from the default).
- accuracy: the share of items where acting or not acting matched the label.
- precision: when the feature acts, how often acting was right.
- recall: of what it should have acted on, how much it did.
- F1: precision and recall in one number.
- calls held: the share of items the feature acts on, at the best value.
- held in error: calls held that should have gone through.
- missed holds: calls that should have been held but went through.
- p50, p95: how long a decision call took (the middle one, and the slow end); cost/case: what the decision calls cost per case.

Best per backend:

- openrouter · typesafe/jev-1.13-20260917: minConfidence 0.8 (accuracy 92.8%; default 0.8: 92.8%)

