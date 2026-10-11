# Web filter: bench summary

**Bench** (`bun src/bench/report.ts web-filter`; 0.11.0@14f7f68). Threshold swept: `minConfidence` (today 0.8). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar drops fewer results and parts, and a dropped one is gone from what the model reads.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | results and parts dropped | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 19 | 0.9 | 97.6% | 100.0% | 96.2% | 98.1% | 61.4% | 473 ms | 638 ms | $0.00006 |

Recommended per backend:

- openrouter · typesafe/jev-1.13-20260917: minConfidence 0.9 (accuracy 97.6%; today's 0.8: 96.4%)

