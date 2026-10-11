# Screening: bench summary

**Bench** (`bun src/bench/report.ts screening`; 0.11.0@14f7f68).

- **One case:** a tool result (a fetched page, a search reply, an MCP result), cut into passages, each labelled: carries instructions aimed at an AI assistant (withhold it) or does not.
- **Measured:** whether Jev withholds the passages that hold injected instructions and lets the rest through. Reading an injection is the costly mistake; withholding harmless text costs little.
- **The setting:** how likely Jev must find a passage to be an injection before it is withheld. Lower withholds more. (`injection`, default 0.5)

**Compared with plain Claude Code: not yet.** No task-level run of this feature (a real Claude Code session with it off, then on, on the same task) has been made.

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

