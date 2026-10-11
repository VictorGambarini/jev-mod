# Routing: bench summary (FAKE backend)

> **FAKE BACKEND.** These numbers come from the bench's fake decision model and show only that the pipeline works. They say nothing about any model.

**Bench** (`bun src/bench/report.ts routing`; 0.11.0@c226712, 0.12.0@fake). Threshold swept: `smallConfidence` (today 0.7). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar sends fewer prompts to the cheapest model; the cost of a miss is a small model on work that needed more.

![accuracy](accuracy-fake.svg)
![effect](effect-fake.svg)
![cost-latency](cost-latency-fake.svg)
![task](task-fake.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | prompts routed to small | under-routed | over-routed | not routed | effort right | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| fake · fake-jev | 81 | 0.5 | 60.5% | 100.0% | 20.8% | 34.5% | 6.2% | 0.054 | 0.365 | 0.012 | 0.689 | 219 ms | 391 ms | $0 |

Recommended per backend:

- fake · fake-jev: smallConfidence 0.5 (accuracy 60.5%; today's 0.7: 58.0%)

| arm | runs | success | score | question context | kept / dropped | wall time | Claude cost | decision cost | Claude tokens |
|---|---|---|---|---|---|---|---|---|---|
| claude | 10 | 100.0% | 100.0% | 30.0k | – | 353 ms | $0.400 | $0 | 30030 |
| jev-mod openrouter | 10 | 100.0% | 100.0% | 30.0k | – | 380 ms | $0.050 | $0 | 30030 |

Spend in all: $4.500 Claude, of which the shared setup $0 (10 case(s), 0 ms); $0 decisions. A failed run is never scored, but its spend counts here.

