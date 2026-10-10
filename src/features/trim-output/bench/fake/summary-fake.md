# Output trimming (test logs): bench summary (FAKE backend)

> **FAKE BACKEND.** These numbers come from the bench's fake decision model and show only that the pipeline works. They say nothing about any model.

**Bench** (`bun src/bench/report.ts trim-output`; 0.10.0@f040686). Threshold swept: `notNeeded` (today 0.9). Recommended = fewest gold lines lost, then most lines cut; a tie goes to the higher value: a higher bar cuts fewer blocks, so fewer lines the goal needs are lost.

![accuracy](accuracy-fake.svg)
![effect](effect-fake.svg)
![cost-latency](cost-latency-fake.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | lines cut | gold lines lost | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|
| fake · fake-jev | 4 | 0.7 | 37.6% | 100.0% | 32.1% | 48.6% | 29.4% | 0 | 176 ms | 392 ms | $0 |
| keep failures only (no backend) | 4 | – | 85.3% | 93.4% | 90.3% | 91.8% | 88.7% | 26 | – | – | $0 |

Recommended per backend:

- fake · fake-jev: notNeeded 0.7 (accuracy 37.6%; today's 0.9: 26.7%)

