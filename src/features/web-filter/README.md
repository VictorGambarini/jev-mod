# Web filter (`web-filter`)

Drops search results and parts of long fetched pages the question does not need.

Modes: `on`, `shadow`, `off`. Default: `off`.

## What it decides

Which search results, and which parts of a long fetched page, your question needs. The rest is cut, with a marker saying what.

## When it runs

After WebSearch, and after a WebFetch of 4,000 characters or more (`fetchMinChars`). It runs after screening, on the screened text, so it never puts unscreened text in front of the model.

## How it decides

**Search.** One request asks of each result (title, URL, snippet; up to 30 results) whether it helps the search query and your latest request. A result the decision model is at least `minConfidence` (0.8) sure does not help goes, and so does a later copy of the same URL. The first `keepTop` (3) results always stay, in their order, and the list ends with a line saying how many went.

**Fetch.** The text is cut into parts of about 2,000 characters (20% overlap, at paragraphs) and one request asks which parts the fetch's prompt and your request need. Each run of dropped parts becomes a marker naming what was cut. Kept without asking: the first part, and any part with code, a date, a figure (money, a percentage, a version, a measurement) or a heading or number the question names.

**Hosts you name.** Nothing is cut from a page whose host your request names.

**Subagents.** A subagent's call is judged by its query or fetch prompt alone.

**Shadow.** What would be dropped is judged in the background and counted; nothing changes and nothing waits for it. The band shows what the filter cut (`🔎 cut 7 · 12.3k chars`), or `would cut` in shadow.

## Settings

| Setting | Default | Range | What it does |
|---|---|---|---|
| `minConfidence` | 0.9 | 0.5-1 | How sure the decision model must be that a result does not help, or a part is not needed, for it to be dropped. |
| `keepTop` | 3 | 1-10 | The first this many distinct search results always stay, in their order. |
| `fetchMinChars` | 4000 | 2000-100000 | A WebFetch result shorter than this is left alone. |
| `timeoutMs` | 3000 | 1000-10000 | How long the result waits for the decision model before it passes unchanged. |

## Failing open, privacy and budget

No key, private mode, the daily budget, a backend cool-off, no answer within `timeoutMs`, or a query or request that looks like it holds a secret: the result passes unchanged. What is sent is redacted.

## Limits

- Results and parts are judged from a snippet or a clip of at most 2,400 characters, not the whole page behind them.
- A page on a host your request names is never cut.

## Benchmarks

<!-- bench:start -->
**Bench** (`bun src/bench/report.ts web-filter`; 0.11.0@14f7f68).

- **One case:** a web search (its results) or a long fetched page (cut into parts), with what the person asked, and for each result or part whether it helps.
- **Measured:** whether Jev drops what does not help and keeps what does. A dropped result is gone from what Claude reads, so dropping a useful one is the costly mistake.
- **The setting:** how sure Jev must be that a result or part is not needed before it is dropped. Higher drops fewer. (`minConfidence`, default 0.9)

**Compared with plain Claude Code: not yet.** No task-level run of this feature (a real Claude Code session with it off, then on, on the same task) has been made.

**Decision level.** Jev answers each case by itself, and the bench replays its answers at every value of `minConfidence`. Best = where accuracy peaks; a tie goes to the higher value: a higher bar drops fewer results and parts, and a dropped one is gone from what the model reads.

**What this means.** At the default 0.9, Jev keeps or drops the right results and parts on 97.6% of the questions over 19 cases. No value in the sweep does better, so the default stays.

![accuracy](bench/results/accuracy.svg)
![effect](bench/results/effect.svg)
![cost-latency](bench/results/cost-latency.svg)

| backend · model | cases | best | accuracy | precision | recall | F1 | results and parts dropped | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 19 | 0.9 | 97.6% | 100.0% | 96.2% | 98.1% | 61.4% | 473 ms | 638 ms | $0.00006 |

- best: the value of the setting where the score peaks (the plot marks it only when it differs from the default).
- accuracy: the share of items where acting or not acting matched the label.
- precision: when the feature acts, how often acting was right.
- recall: of what it should have acted on, how much it did.
- F1: precision and recall in one number.
- results and parts dropped: the share of items the feature acts on, at the best value.
- p50, p95: how long a decision call took (the middle one, and the slow end); cost/case: what the decision calls cost per case.

Best per backend:

- openrouter · typesafe/jev-1.13-20260917: minConfidence 0.9 (accuracy 97.6%; default 0.9: 97.6%)
<!-- bench:end -->

### Task level: what plain Claude Code reads against what the filter leaves

`bun src/bench/run.ts web-filter --level task --backend openrouter` (add `--yes` to spend). One task is a question a long page answers in a sentence or two: nine of them, on made-up handbook pages of 14,000 to 19,000 characters served from 127.0.0.1 (`bench/pages.ts`, `src/bench/web-server.ts`), with the needle among look-alike sections that answer other questions, and one task spread over two pages. Claude fetches the page with WebFetch, asking for a section-by-section listing, and answers; the checker is the exact answer (every pattern of it must match).

- **Plain Claude Code** is jev-mod switched off whole (a kill file in a scratch config folder); it reads what WebFetch returns, all of it.
- **jev-mod** has the web filter on (`--sweep minConfidence=0.7:0.9:0.1` to sweep it), with screening as shipped, so it first screens the result and then cuts what the question does not need.

Measured per arm: accuracy, wall time, Claude's cost and the context its question read (what the filter shrinks), the decision model's cost (the screen's calls and the filter's), and their total. An arm whose filter was never asked is `no_long_fetch`, not a score.

What it does not cover: WebSearch cannot be served locally, so the filter's search path is judged at the decision level only. WebFetch does not return the page: a small model summarises it for the prompt Claude gives, and the filter sees that text (4,000 characters or more), so the prompt asks for a listing that runs long. A run is only as long as that summary is, and the summary varies from run to run.
