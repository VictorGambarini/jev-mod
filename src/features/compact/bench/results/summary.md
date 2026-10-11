# /jev-mod compact: bench summary

**Bench** (`bun src/bench/report.ts compact`; 0.11.0@14f7f68). Threshold swept: `drop` (today 0.7). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar keeps more, and a dropped message cannot be had back.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | messages dropped | keep lost | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 10 | 0.5 | 88.7% | 100.0% | 76.1% | 86.4% | 35.8% | 0 | 474 ms | 710 ms | $0.00008 |

Recommended per backend:

- openrouter · typesafe/jev-1.13-20260917: drop 0.5 (accuracy 88.7%; today's 0.7: 80.1%)

