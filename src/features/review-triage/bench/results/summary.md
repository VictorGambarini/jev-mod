# Review triage: bench summary

**Bench** (`bun src/bench/report.ts review-triage`; 0.11.0@14f7f68). Threshold swept: `minConfidence` (today 0.8). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar answers quick less often, and a full review costs only time; a wrongly quick one skips a review.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | changes called quick | full skipped | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 51 | 0.55 | 94.1% | 100.0% | 82.4% | 90.3% | 27.5% | 0 | 468 ms | 523 ms | $0.00004 |

Recommended per backend:

- openrouter · typesafe/jev-1.13-20260917: minConfidence 0.55 (accuracy 94.1%; today's 0.8: 84.3%)

