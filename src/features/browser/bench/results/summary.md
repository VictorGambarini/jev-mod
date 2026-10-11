# Browser: bench summary

**Bench** (`bun src/bench/report.ts browser`; 0.11.0@14f7f68). Threshold swept: `confirmConfidence` (today 0.85). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar stops before more consequential steps (the person is asked, and the run resumes) and accepts "done" less often.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | consequential steps and "done" accepted | next right % | reached right % | stuck right % | risky picked wrongly | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 59 | 0.5 | 97.7% | 100.0% | 96.2% | 98.0% | 56.8% | 88.1 | 98.3 | 100 | 0 | 472 ms | 577 ms | $0.00004 |

Recommended per backend:

- openrouter · typesafe/jev-1.13-20260917: confirmConfidence 0.5 (accuracy 97.7%; today's 0.85: 86.4%)

