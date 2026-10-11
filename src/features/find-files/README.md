# Find files (`find-files`)

A tool the model calls to find the files that implement something described in plain words.

Modes: `on`, `off`. Default: `off`. There is no shadow: the model calls the tool by choice, so there is nothing to watch it do unasked.

## What it decides

Which files implement what the model describes ("where retries with backoff are done"). The model gets a ranked list of paths with a reason each, in place of a chain of greps. Each file is judged *implements*, *related* or *unrelated*.

## When it runs

When the model calls `find_files` (`mcp__jev-mod__find_files`), which is offered while the feature is on. With `off`, the tool is not offered (a session started while it was on keeps it, and it answers that it is off).

## How it decides

1. The project's files (git's list, so `.gitignore` is honoured; a plain walk without git) are scored locally by the query's words in each path, its first lines and how many lines mention them.
2. The best `maxCandidates` (60) go to the decision model as short redacted cards: path, header comment, the names it defines, and a few matching lines.
3. The decision model judges each *implements*, *related* or *unrelated*, and the model gets the ranked list.

## Settings

| Setting | Default | Range | What it does |
|---|---|---|---|
| `maxCandidates` | 60 | 10-200 | How many of the best local matches the decision model judges per query: more finds more, and costs more. |
| `limit` | 10 | 1-50 | How many files the tool returns when the model does not say. |
| `timeoutMs` | 8000 | 1000-30000 | How long the tool waits for the decision model before it answers with the local ranking. |

## Failing open, privacy and budget

It always answers. With no key, private mode, the daily budget, a backend cool-off, no answer within `timeoutMs`, or a failing backend, the local ranking comes back, labelled as such. A card or query that looks like it holds a secret is not sent; cards are redacted.

## Limits

- Only the first 20,000 files git lists are scored; a walk without git stops after 5,000.
- The local ranking is word matching, so a description with none of the code's words may miss the file.

## Benchmarks

<!-- bench:start -->
**Bench** (`bun src/bench/report.ts find-files`; 0.11.0@14f7f68). Threshold swept: `limit` (today 10). Recommended = peak F2 (recall counts double); a tie goes to the lower value: a lower limit returns fewer files for the model to open and read; the cost is a miss when the right file ranks below it.

![accuracy](bench/results/accuracy.svg)
![effect](bench/results/effect.svg)
![cost-latency](bench/results/cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | candidates returned | queries with a hit | local-only F1 | gold the local step missed | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 48 | 1 | 99.2% | 95.7% | 97.8% | 96.8% | 12.6% | 1 | 0.903 | 0.022 | 463 ms | 546 ms | $0.00006 |

Recommended per backend:

- openrouter · typesafe/jev-1.13-20260917: limit 1 (accuracy 99.2%; today's 10: 73.4%)
<!-- bench:end -->
