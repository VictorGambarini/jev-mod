# /jev-mod compact: bench summary (FAKE backend)

> **FAKE BACKEND.** These numbers come from the bench's fake decision model and show only that the pipeline works. They say nothing about any model.

**Bench** (`bun src/bench/report.ts compact`; 0.10.0@f040686).

- **One case:** a made-up coding session, each message labelled keep or drop by a careful person (keep: a decision, a constraint, an exact path or error; drop: chatter, superseded attempts).
- **Measured:** for each message outside the last six (always kept), whether Jev's keep or drop call matches the label. Dropping a message labelled keep is the costly mistake: it cannot be had back.
- **The setting:** how sure Jev must be that a message can go before /jev-mod compact drops it. Higher keeps more. (`drop`, default 0.5)

**Compared with plain Claude Code: not yet.** No task-level run of this feature (a real Claude Code session with it off, then on, on the same task) has been made.

**Decision level.** Jev answers each case by itself, and the bench replays its answers at every value of `drop`. Best = where accuracy peaks; a tie goes to the higher value: a higher bar keeps more, and a dropped message cannot be had back.

**What this means.** At the default 0.5, Jev makes the same keep or drop call as the label on 83.4% of the messages in 10 sessions. No value in the sweep does better, so the default stays.

![accuracy](accuracy-fake.svg)
![effect](effect-fake.svg)
![cost-latency](cost-latency-fake.svg)

| backend · model | cases | best | accuracy | precision | recall | F1 | messages dropped | keep lost | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fake · fake-jev | 10 | 0.5 | 83.4% | 100.0% | 64.8% | 78.6% | 30.5% | 0 | 275 ms | 397 ms | $0 |

- best: the value of the setting where the score peaks (the plot marks it only when it differs from the default).
- accuracy: the share of items where acting or not acting matched the label.
- precision: when the feature acts, how often acting was right.
- recall: of what it should have acted on, how much it did.
- F1: precision and recall in one number.
- messages dropped: the share of items the feature acts on, at the best value.
- keep lost: messages labelled keep that were dropped: the costly mistake.
- p50, p95: how long a decision call took (the middle one, and the slow end); cost/case: what the decision calls cost per case.

Best per backend:

- fake · fake-jev: drop 0.5 (accuracy 83.4%; default 0.5: 83.4%)

