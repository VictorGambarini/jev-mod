# Routing: bench summary

**Bench** (`bun src/bench/report.ts routing`; 0.11.0@14f7f68). Threshold swept: `smallConfidence` (today 0.7). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar sends fewer prompts to the cheapest model; the cost of a miss is a small model on work that needed more.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | prompts routed to small | under-routed | over-routed | not routed | effort right | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 81 | 0.7 | 81.5% | 100.0% | 75.0% | 85.7% | 22.2% | 0.082 | 0.096 | 0.025 | 0.863 | 471 ms | 550 ms | $0.00003 |

Recommended per backend:

- openrouter · typesafe/jev-1.13-20260917: smallConfidence 0.7 (accuracy 81.5%; today's 0.7: 81.5%)

