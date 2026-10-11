# Rules gate: bench summary

**Bench** (`bun src/bench/report.ts rules-gate`; 0.11.0@14f7f68).

- **One case:** an edit to a file in a project, with the written rules that apply to that file, and for each rule whether the edit breaks it.
- **Measured:** for each rule, whether Jev says broken when it is. Refusing an edit that breaks no rule is a wasted turn; letting a breaking one through is the miss.
- **The setting:** how sure Jev must be that a rule is broken before the edit is refused. Higher refuses fewer edits, and a doubtful one goes on. (`minConfidence`, default 0.9)

**Compared with plain Claude Code: not yet.** No task-level run of this feature (a real Claude Code session with it off, then on, on the same task) has been made.

**Decision level.** Jev answers each case by itself, and the bench replays its answers at every value of `minConfidence`. Best = where accuracy peaks; a tie goes to the higher value: a higher bar refuses fewer edits, and the mod fails open: a doubtful edit goes on.

**What this means.** At the default 0.9, Jev judges the rules right on 91.3% of the rule checks over 8 edits. No value in the sweep does better, so the default stays.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | best | accuracy | precision | recall | F1 | rules judged broken | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 8 | 0.9 | 91.3% | 100.0% | 71.4% | 83.3% | 21.7% | 460 ms | 527 ms | $0.00003 |

- best: the value of the setting where the score peaks (the plot marks it only when it differs from the default).
- accuracy: the share of items where acting or not acting matched the label.
- precision: when the feature acts, how often acting was right.
- recall: of what it should have acted on, how much it did.
- F1: precision and recall in one number.
- rules judged broken: the share of items the feature acts on, at the best value.
- p50, p95: how long a decision call took (the middle one, and the slow end); cost/case: what the decision calls cost per case.

Best per backend:

- openrouter · typesafe/jev-1.13-20260917: minConfidence 0.9 (accuracy 91.3%; default 0.9: 91.3%)

