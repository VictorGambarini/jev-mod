# find-files: bench summary (FAKE backend)

> **FAKE BACKEND.** These numbers come from the bench's fake decision model and show only that the pipeline works. They say nothing about any model.

**Bench** (`bun src/bench/report.ts find-files`; 0.11.0@c226712). Threshold swept: `limit` (today 10). Recommended = peak F2 (recall counts double); a tie goes to the lower value: a lower limit returns fewer files for the model to open and read; the cost is a miss when the right file ranks below it.

![accuracy](accuracy-fake.svg)
![effect](effect-fake.svg)
![cost-latency](cost-latency-fake.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | candidates returned | queries with a hit | local-only F1 | gold the local step missed | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| fake · fake-jev | 48 | 1 | 95.7% | 82.6% | 82.6% | 82.6% | 12.4% | 0.844 | 0.903 | 0.022 | 225 ms | 339 ms | $0 |

Recommended per backend:

- fake · fake-jev: limit 1 (accuracy 95.7%; today's 10: 63.4%)

