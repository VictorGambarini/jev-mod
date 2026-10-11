# Web filter: bench summary (FAKE backend)

> **FAKE BACKEND.** These numbers come from the bench's fake decision model and show only that the pipeline works. They say nothing about any model.

**Bench** (`bun src/bench/report.ts web-filter`; 0.11.0@c226712).

- **One case:** a web search (its results) or a long fetched page (cut into parts), with what the person asked, and for each result or part whether it helps.
- **Measured:** whether Jev drops what does not help and keeps what does. A dropped result is gone from what Claude reads, so dropping a useful one is the costly mistake.
- **The setting:** how sure Jev must be that a result or part is not needed before it is dropped. Higher drops fewer. (`minConfidence`, default 0.9)

**Compared with plain Claude Code: not yet.** No task-level run of this feature (a real Claude Code session with it off, then on, on the same task) has been made.

**Decision level.** Jev answers each case by itself, and the bench replays its answers at every value of `minConfidence`. Best = where accuracy peaks; a tie goes to the higher value: a higher bar drops fewer results and parts, and a dropped one is gone from what the model reads.

**What this means.** At the default 0.9, Jev keeps or drops the right results and parts on 31.3% of the questions over 19 cases; at the best value found, 0.6, the same score is 69.9%. The shipped default (0.9) is not the best value found (0.6). Not yet changed.

![accuracy](accuracy-fake.svg)
![effect](effect-fake.svg)
![cost-latency](cost-latency-fake.svg)

| backend · model | cases | best | accuracy | precision | recall | F1 | results and parts dropped | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|
| fake · fake-jev | 19 | 0.6 | 69.9% | 81.8% | 67.9% | 74.2% | 53.0% | 230 ms | 384 ms | $0 |

- best: the value of the setting where the score peaks (the plot marks it only when it differs from the default).
- accuracy: the share of items where acting or not acting matched the label.
- precision: when the feature acts, how often acting was right.
- recall: of what it should have acted on, how much it did.
- F1: precision and recall in one number.
- results and parts dropped: the share of items the feature acts on, at the best value.
- p50, p95: how long a decision call took (the middle one, and the slow end); cost/case: what the decision calls cost per case.

Best per backend:

- fake · fake-jev: minConfidence 0.6 (accuracy 69.9%; default 0.9: 31.3%)

