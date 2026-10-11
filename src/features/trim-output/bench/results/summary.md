# Output trimming (test logs): bench summary

**Bench** (`bun src/bench/report.ts trim-output`; 0.11.0@14f7f68). Threshold swept: `notNeeded` (today 0.9). Recommended = fewest gold lines lost, then most lines cut; a tie goes to the higher value: a higher bar cuts fewer blocks, so fewer lines the goal needs are lost.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | lines cut | gold lines lost | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 4 | 0.8 | 49.6% | 100.0% | 45.1% | 62.2% | 41.4% | 0 | 468 ms | 542 ms | $0.00017 |
| keep failures only (no backend) | 4 | – | 85.3% | 93.4% | 90.3% | 91.8% | 88.7% | 26 | – | – | $0 |

Recommended per backend:

- openrouter · typesafe/jev-1.13-20260917: notNeeded 0.8 (accuracy 49.6%; today's 0.9: 18.1%)

