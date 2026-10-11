# Skills: bench summary (FAKE backend)

> **FAKE BACKEND.** These numbers come from the bench's fake decision model and show only that the pipeline works. They say nothing about any model.

**Bench** (`bun src/bench/report.ts skills`; 0.11.0@c226712). Threshold swept: `match` (today 0.5). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar suggests less often; a wrong suggestion costs a detour and context, a missed one costs nothing the model would not have done anyway.

![accuracy](accuracy-fake.svg)
![effect](effect-fake.svg)
![cost-latency](cost-latency-fake.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | prompts given a suggestion | right skill first | wrong skill suggested | unneeded suggestion | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| fake · fake-jev | 72 | 0.35 | 81.9% | 97.2% | 74.5% | 84.3% | 50.0% | 0.979 | 0.021 | 0 | 243 ms | 389 ms | $0 |

Recommended per backend:

- fake · fake-jev: match 0.35 (accuracy 81.9%; today's 0.5: 77.8%)

