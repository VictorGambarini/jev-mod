# /jev-mod compact: bench summary

**Bench** (`bun src/bench/report.ts compact`; 0.11.0@14f7f68, 0.11.0@40135d0). Threshold swept: `drop` (today 0.7). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar keeps more, and a dropped message cannot be had back.

![accuracy](accuracy.svg)
![effect](effect.svg)
![cost-latency](cost-latency.svg)
![task](task.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | messages dropped | keep lost | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 10 | 0.5 | 88.7% | 100.0% | 76.1% | 86.4% | 35.8% | 0 | 474 ms | 710 ms | $0.00008 |

Recommended per backend:

- openrouter · typesafe/jev-1.13-20260917: drop 0.5 (accuracy 88.7%; today's 0.7: 80.1%)

| arm | runs | success | score | question context | kept / dropped | wall time | Claude cost | decision cost | Claude tokens |
|---|---|---|---|---|---|---|---|---|---|
| claude | 1 | 100.0% | 100.0% | 41.0k | – | 97.0 s | $6.783 | $0 | 41746 |
| no compaction | 1 | 100.0% | 100.0% | 176.5k | – | 10.9 s | $4.291 | $0 | 177382 |
| jev-mod openrouter drop=0.6 | 1 (failed: 1 not_compacted) | – | – | 187.0k | 138 / 6 of 144 | – | – | – | – |
| jev-mod openrouter drop=0.7 | 1 (failed: 1 not_compacted) | – | – | 187.0k | 139 / 5 of 144 | – | – | – | – |
| jev-mod openrouter drop=0.8 | 1 (failed: 1 not_compacted) | – | – | 187.0k | 143 / 1 of 144 | – | – | – | – |
| jev-mod openrouter drop=0.9 | 1 (failed: 1 not_compacted) | – | – | 176.7k | 144 / 0 of 144 | – | – | – | – |

Spend in all: $56.926 Claude, of which the shared setup $18.181 (1 case(s), 402.7 s); $0.00347 decisions. A failed run is never scored, but its spend counts here.

