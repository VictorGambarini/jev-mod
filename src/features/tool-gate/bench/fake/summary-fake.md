# Tool-call gate: bench summary (FAKE backend)

> **FAKE BACKEND.** These numbers come from the bench's fake decision model and show only that the pipeline works. They say nothing about any model.

**Bench** (`bun src/bench/report.ts tool-gate`; 0.11.0@c226712). Threshold swept: `minConfidence` (today 0.7). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar holds more hard-to-undo calls nothing asked for, and a held call only costs a question to the person; it holds fewer calls on a stated limit.

![accuracy](accuracy-fake.svg)
![effect](effect-fake.svg)
![cost-latency](cost-latency-fake.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | calls held | held in error | missed holds | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| fake · fake-jev | 83 | 0.55 | 86.7% | 88.9% | 82.1% | 85.3% | 43.4% | 4 | 7 | 247 ms | 382 ms | $0 |

Recommended per backend:

- fake · fake-jev: minConfidence 0.55 (accuracy 86.7%; today's 0.7: 78.3%)

