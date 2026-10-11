### Routing, task level (FAKE: a fake claude, not a measurement): task-fake.fake.jsonl

| difficulty | arm | success | Claude $/task | decision $/task | total $/task | wall s/task | Claude spend by model |
|---|---|---|---|---|---|---|---|
| trivial | claude | 4/4 | $0.400 | $0.00 | $0.400 | 0 | opus 100% |
| trivial | jev-mod openrouter | 4/4 | $0.050 | $0.00 | $0.050 | 0 | haiku 100% |
| medium | claude | 3/3 | $0.400 | $0.00 | $0.400 | 0 | opus 100% |
| medium | jev-mod openrouter | 3/3 | $0.050 | $0.00 | $0.050 | 0 | haiku 100% |
| hard | claude | 3/3 | $0.400 | $0.00 | $0.400 | 0 | opus 100% |
| hard | jev-mod openrouter | 3/3 | $0.050 | $0.00 | $0.050 | 0 | haiku 100% |
| all | claude | 10/10 | $0.400 | $0.00 | $0.400 | 0 | opus 100% |
| all | jev-mod openrouter | 10/10 | $0.050 | $0.00 | $0.050 | 0 | haiku 100% |

| case | difficulty | arm | success | score | Claude $ | decision $ | wall s | models |
|---|---|---|---|---|---|---|---|---|
| typo-message | trivial | claude | yes | 1.00 | $0.400 | $0.00 | 0 | opus |
| typo-message | trivial | jev-mod openrouter | yes | 1.00 | $0.050 | $0.00 | 0 | haiku |
| rename-function | trivial | claude | yes | 1.00 | $0.400 | $0.00 | 1 | opus |
| rename-function | trivial | jev-mod openrouter | yes | 1.00 | $0.050 | $0.00 | 0 | haiku |
| lb-conversion | trivial | claude | yes | 1.00 | $0.400 | $0.00 | 0 | opus |
| lb-conversion | trivial | jev-mod openrouter | yes | 1.00 | $0.050 | $0.00 | 0 | haiku |
| lookup-quote | trivial | claude | yes | 1.00 | $0.400 | $0.00 | 0 | opus |
| lookup-quote | trivial | jev-mod openrouter | yes | 1.00 | $0.050 | $0.00 | 0 | haiku |
| express-option | medium | claude | yes | 1.00 | $0.400 | $0.00 | 0 | opus |
| express-option | medium | jev-mod openrouter | yes | 1.00 | $0.050 | $0.00 | 0 | haiku |
| report-by-zone | medium | claude | yes | 1.00 | $0.400 | $0.00 | 0 | opus |
| report-by-zone | medium | jev-mod openrouter | yes | 1.00 | $0.050 | $0.00 | 0 | haiku |
| public-holidays | medium | claude | yes | 1.00 | $0.400 | $0.00 | 0 | opus |
| public-holidays | medium | jev-mod openrouter | yes | 1.00 | $0.050 | $0.00 | 0 | haiku |
| gst-rounding | hard | claude | yes | 1.00 | $0.400 | $0.00 | 0 | opus |
| gst-rounding | hard | jev-mod openrouter | yes | 1.00 | $0.050 | $0.00 | 0 | haiku |
| weekend-eta | hard | claude | yes | 1.00 | $0.400 | $0.00 | 0 | opus |
| weekend-eta | hard | jev-mod openrouter | yes | 1.00 | $0.050 | $0.00 | 0 | haiku |
| report-total | hard | claude | yes | 1.00 | $0.400 | $0.00 | 0 | opus |
| report-total | hard | jev-mod openrouter | yes | 1.00 | $0.050 | $0.00 | 0 | haiku |
