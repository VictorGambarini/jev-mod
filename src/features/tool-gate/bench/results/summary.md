# Tool-call gate: bench summary

**Bench** (`bun src/bench/report.ts tool-gate`; 0.11.0@14f7f68). Threshold swept: `minConfidence` (today 0.7). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar holds more hard-to-undo calls nothing asked for, and a held call only costs a question to the person; it holds fewer calls on a stated limit.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | calls held | held in error | missed holds | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 83 | 0.8 | 92.8% | 97.1% | 87.2% | 91.9% | 42.2% | 1 | 5 | 469 ms | 528 ms | $0.00002 |

Recommended per backend:

- openrouter · typesafe/jev-1.13-20260917: minConfidence 0.8 (accuracy 92.8%; today's 0.7: 91.6%)

