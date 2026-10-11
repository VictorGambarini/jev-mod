# Browser: bench summary

**Bench** (`bun src/bench/report.ts browser`; 0.11.0@14f7f68, 0.12.0@55065cf).

- **One case:** a web page the browser agent is looking at (a made-up snapshot of its buttons and links), with a goal such as "buy the blue mug".
- **Measured:** whether Jev says to go ahead on the risky step (buy, send, delete) only when the goal asks for it, and to accept "done" only when the page shows it. Also the next-step pick, goal reached and stuck, as extra columns. Going ahead on a step the goal did not ask for is the costly mistake.
- **The setting:** how sure Jev must be that the goal asks for a risky step before the agent takes it; below that the person is asked first. Higher means more questions and fewer wrong purchases. (`confirmConfidence`, default 0.85)

**Compared with plain Claude Code:**

![task](task.svg)

| arm | runs | success | mean score | median time | total time | Claude cost | feature decision cost | other jev-mod decision cost | total cost |
|---|---|---|---|---|---|---|---|---|---|
| plain Claude Code | 10 | 90.0% | 90.0% | 18.1 s | 178.8 s | $0.139 | $0 | $0 | $0.139 |
| jev-mod openrouter | 10 | 80.0% | 80.0% | 19.7 s | 266.7 s | $0.079 | $0.00068 | $0.00001 | $0.079 |

- success: the share of scored runs the checker marked right; mean score: its partial credit (the share of questions answered right, say).
- median time: over scored runs; total time: every run of the arm, failed ones too.
- costs are per scored run. Feature decision cost: what browser's own decisions cost; other jev-mod decision cost: what other jev-mod features still asked in the arm (a protective feature the bench may not switch off, as the person has it). Total cost is Claude plus both. A failed run is never scored.
- plain Claude Code runs with jev-mod switched off whole, so it makes no decisions; a plain run that shows any is an error (`decisions_in_plain_arm`). Runs from jev-mod 0.12.0 and before switched off only the features that change what the model sees.

- jev-mod openrouter: right on 80.0% (plain Claude Code 90.0%) of runs, median 19.7 s (plain Claude Code 18.1 s), $0.079 (plain Claude Code $0.139) per run (Claude $0.079, browser's decisions $0.00068, other jev-mod decisions $0.00001).

| arm | question context | kept / dropped | Claude tokens |
|---|---|---|---|
| plain Claude Code | 132.4k | – | 133294 |
| jev-mod openrouter | 57.7k | – | 58445 |

- question context: what the last step read, in tokens (a smaller one is a compaction that worked); kept / dropped: messages the compaction kept and dropped, of those before it.

Spend in all: $2.175 Claude; $0.00684 decisions. A failed run is never scored, but its spend counts here.

**Decision level.** Jev answers each case by itself, and the bench replays its answers at every value of `confirmConfidence`. Best = where accuracy peaks; a tie goes to the higher value: a higher bar stops before more consequential steps (the person is asked, and the run resumes) and accepts "done" less often.

**What this means.** At the default 0.85, Jev gives the right go-ahead answer on 86.4% of the questions over the 59 pages; at the best value found, 0.5, the same score is 97.7%. The shipped default (0.85) is not the best value found (0.5). It is kept on purpose: lowering it asks the person less often before buy, send and delete steps, so it stays at 0.85 until the real-browser comparison shows what that costs.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | best | accuracy | precision | recall | F1 | consequential steps and "done" accepted | next right % | reached right % | stuck right % | risky picked wrongly | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 59 | 0.5 | 97.7% | 100.0% | 96.2% | 98.0% | 56.8% | 88.1 | 98.3 | 100 | 0 | 472 ms | 577 ms | $0.00004 |

- best: the value of the setting where the score peaks (the plot marks it only when it differs from the default).
- accuracy: the share of items where acting or not acting matched the label.
- precision: when the feature acts, how often acting was right.
- recall: of what it should have acted on, how much it did.
- F1: precision and recall in one number.
- consequential steps and "done" accepted: the share of items the feature acts on, at the best value.
- next right %: how often Jev picked the right next button or link on the page.
- reached right %: how often Jev was right about whether the goal was already reached.
- stuck right %: how often Jev was right about whether the run was stuck.
- risky picked wrongly: pages where the step Jev picked was a risky one the goal did not ask for.
- p50, p95: how long a decision call took (the middle one, and the slow end); cost/case: what the decision calls cost per case.

Best per backend:

- openrouter · typesafe/jev-1.13-20260917: confirmConfidence 0.5 (accuracy 97.7%; default 0.85: 86.4%)

