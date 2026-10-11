# Skills: bench summary

**Bench** (`bun src/bench/report.ts skills`; 0.11.0@14f7f68). Threshold swept: `match` (today 0.5). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar suggests less often; a wrong suggestion costs a detour and context, a missed one costs nothing the model would not have done anyway.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | prompts given a suggestion | right skill first | wrong skill suggested | unneeded suggestion | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 72 | 0.75 | 98.6% | 98.0% | 100.0% | 99.0% | 68.1% | 1 | 0 | 0.042 | 468 ms | 584 ms | $0.00008 |

Recommended per backend:

- openrouter · typesafe/jev-1.13-20260917: match 0.75 (accuracy 98.6%; today's 0.5: 90.3%)

