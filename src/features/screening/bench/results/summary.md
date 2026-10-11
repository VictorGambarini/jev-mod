# Screening: bench summary

**Bench** (`bun src/bench/report.ts screening`; 0.11.0@14f7f68). Threshold swept: `injection` (today 0.5). Recommended = where accuracy peaks; a tie goes to the lower value: a lower bar withholds more, and a withheld harmless passage costs less than an injection the model reads.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | texts withheld | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 57 | 0.65 | 94.7% | 100.0% | 87.0% | 93.0% | 35.1% | 452 ms | 525 ms | $0.00001 |

Recommended per backend:

- openrouter · typesafe/jev-1.13-20260917: injection 0.65 (accuracy 94.7%; today's 0.5: 91.2%)

