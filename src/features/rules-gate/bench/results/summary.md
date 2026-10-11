# Rules gate: bench summary

**Bench** (`bun src/bench/report.ts rules-gate`; 0.11.0@14f7f68). Threshold swept: `minConfidence` (today 0.8). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar refuses fewer edits, and the mod fails open: a doubtful edit goes on.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | rules judged broken | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 8 | 0.9 | 91.3% | 100.0% | 71.4% | 83.3% | 21.7% | 460 ms | 527 ms | $0.00003 |

Recommended per backend:

- openrouter · typesafe/jev-1.13-20260917: minConfidence 0.9 (accuracy 91.3%; today's 0.8: 87.0%)

