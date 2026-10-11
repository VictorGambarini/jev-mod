# Access gate: bench summary

**Bench** (`bun src/bench/report.ts access-gate`; 0.11.0@14f7f68). Threshold swept: `none` (today 1). Recommended = where accuracy peaks; a tie goes to the higher value: there is no threshold: the gate reads each call locally and every answer is 0 or 1.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | calls refused | blocked in error | missed | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · ~typesafe/jev-latest | 117 | 1 | 97.4% | 100.0% | 96.0% | 98.0% | 61.5% | 0 | 3 | – | – | $0 |

Recommended per backend:

- openrouter · ~typesafe/jev-latest: none 1 (accuracy 97.4%; today's 1: 97.4%)

