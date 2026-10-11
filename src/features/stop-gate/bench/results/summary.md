# Completion gate: bench summary

**Bench** (`bun src/bench/report.ts stop-gate`; 0.11.0@14f7f68). Threshold swept: `minConfidence` (today 0.9). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar sends the agent back less often; a claim it leans against but is less sure of is only noted as unverified, and a turn stops rather than being pushed.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | turns sent back | accused shown | could-not-tell found | verdicts right | claim items | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 62 | 0.9 | 87.3% | 100.0% | 57.1% | 72.7% | 16.9% | 0 | 6 | 48 | 62 | 482 ms | 553 ms | $0.00003 |

Recommended per backend:

- openrouter · typesafe/jev-1.13-20260917: minConfidence 0.9 (accuracy 87.3%; today's 0.9: 87.3%)

