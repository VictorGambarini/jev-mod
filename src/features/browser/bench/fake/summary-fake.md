# Browser: bench summary (FAKE backend)

> **FAKE BACKEND.** These numbers come from the bench's fake decision model and show only that the pipeline works. They say nothing about any model.

**Bench** (`bun src/bench/report.ts browser`; 0.11.0@c226712). Threshold swept: `confirmConfidence` (today 0.85). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar stops before more consequential steps (the person is asked, and the run resumes) and accepts "done" less often.

![accuracy](accuracy-fake.svg)
![effect](effect-fake.svg)
![cost-latency](cost-latency-fake.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | consequential steps and "done" accepted | next right % | reached right % | stuck right % | risky picked wrongly | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| fake · fake-jev | 59 | 0.55 | 86.4% | 88.5% | 88.5% | 88.5% | 59.1% | 71.2 | 83.1 | 98.3 | 1 | 234 ms | 376 ms | $0 |

Recommended per backend:

- fake · fake-jev: confirmConfidence 0.55 (accuracy 86.4%; today's 0.85: 63.6%)

