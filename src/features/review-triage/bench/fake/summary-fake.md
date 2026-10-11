# Review triage: bench summary (FAKE backend)

> **FAKE BACKEND.** These numbers come from the bench's fake decision model and show only that the pipeline works. They say nothing about any model.

**Bench** (`bun src/bench/report.ts review-triage`; 0.11.0@c226712). Threshold swept: `minConfidence` (today 0.8). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar answers quick less often, and a full review costs only time; a wrongly quick one skips a review.

![accuracy](accuracy-fake.svg)
![effect](effect-fake.svg)
![cost-latency](cost-latency-fake.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | changes called quick | full skipped | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fake · fake-jev | 51 | 0.55 | 82.4% | 90.0% | 52.9% | 66.7% | 19.6% | 1 | 259 ms | 382 ms | $0 |

Recommended per backend:

- fake · fake-jev: minConfidence 0.55 (accuracy 82.4%; today's 0.8: 66.7%)

