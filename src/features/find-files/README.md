# Find files (`find-files`)

A tool the model calls to find the code that does something described in plain words, or where a name is defined and used.

Modes: `on`, `off`. Default: `off`. There is no shadow: the model calls the tool by choice, so there is nothing to watch it do unasked.

## What it decides

Which files implement what the model describes ("where failed webhook deliveries are retried"). The model gets a ranked list of paths, each with a reason and the lines to read first, in place of a chain of greps. Each candidate file is judged *implements*, *related* or *unrelated*. When every candidate is judged unrelated, the answer says that nothing here implements it.

Given `symbol` (one exact name) instead, nothing is decided by a model: the answer is read from the code (see "Symbol lookup").

## When it runs

When the model calls `find_files` (`mcp__jev-mod__find_files`), which is offered while the feature is on. With `off`, the tool is not offered (a session started while it was on keeps it, and it answers that it is off).

The description tells the model to use it when it does not know the names the code uses, and for "where is X defined" or "what calls X" with `symbol`, and not for one exact string or a file name it already knows (Grep or Glob does that in one call).

## How it decides

The tool takes `query` (what the code does, in plain words) or `symbol`. With `query`, the model may also give:

- `identifiers`: names it guesses the code uses (refundPayment, retry_policy, InvoiceRenderer), in any case style;
- `synonyms`: other words for the thing and related terms (refund: chargeback, reversal).

Then:

1. The project's files (git's list, so `.gitignore` is honoured; a plain walk without git) are scored locally by the words in each path, its first lines (header comment, the names it defines, imports) and how many lines mention them. The model's extra words count 0.7 of the query's own; a file that defines one of the guessed names exactly (from its first lines, or from the symbol index) gets a bonus of 4; a test file counts 0.6 of its score, so its repeated words do not crowd out the code.
2. **The shortcut** (`shortcut`, on by default): when one to three files lead clearly, they are the answer and the decision model is not asked. A file leads when it scores at least 1.5 times the file after it (the k-th of k files, the (k+1)-th), scores 6 or more, and holds three quarters of the query's own words (not the added ones) in its path, the names it defines or its header comment. A one-word query never leads. On the decision-level cases it fires on about half the queries, always with an implementing file first, and never on a query with nothing to find (`bench/adapter.test.ts`). The answer says it was ranked locally and why.
3. Otherwise the best `maxCandidates` (60) go to the decision model as short redacted cards: path, header comment, the names it defines, and a few matching lines. It judges each *implements*, *related* or *unrelated*; the list is ordered by that, and files judged unrelated are left out. When all of them are judged unrelated, the answer says nothing here implements it, with the closest by words.
4. **Places:** each file listed comes with the lines to read first (three for the first three files, one after): the definitions whose names hold the most of the words, then the code lines holding the most (comments, strings and imports do not count in a language it knows; any line counts in one it does not, such as SQL).

## Symbol lookup

`symbol` takes one identifier. The answer lists, with `path:line` and the line's text: where it is **defined** (and as what: function, method, class, type, variable, field), **called**, **used** otherwise, and **imported**, in code only. A mention in a comment or a string does not count, and neither does a longer name holding it (`refundPayment` never matches `refundPaymentLater`); a Python keyword argument of the same name is not the symbol. Test files are listed after the code. Names alike (another case style, `refund_payment`; a longer name, `refundPaymentLater`) are named apart, not counted.

- **How:** `git grep -w -l` finds the files holding the word (ripgrep without git; every code file read without either), each is stripped of comments and strings, and each line holding the name gets its role from per-language rules (regular expressions on the stripped lines, no parser): TypeScript and JavaScript, Python, Go, Rust, Java and its kin (Kotlin, C#, Swift, Scala, C, C++, PHP, Dart), Ruby.
- **The index:** every code file's definitions, kept per project folder under `<XDG_CACHE_HOME or ~/.cache>/jev-mod/find-files/` (the folder 0700) and keyed by each file's git blob, so a commit or a checkout re-reads only the files it changed; files changed but not committed, and untracked ones, are read every time and never kept. A call spends at most 4 s adding to it, and the next call goes on. It names the definitions alike to the one asked for and gives `identifiers` their bonus. Without git it is not kept.
- **What it asks:** no decision model, so it costs nothing and needs no key.

## Settings

| Setting | Default | Range | What it does |
|---|---|---|---|
| `maxCandidates` | 60 | 10-200 | How many of the best local matches the decision model judges per query: more finds more, and costs more. |
| `limit` | 10 | 1-50 | How many files the tool returns when the model does not say. |
| `timeoutMs` | 8000 | 1000-30000 | How long the tool waits for the decision model before it answers with the local ranking. |
| `shortcut` | on | on, off | When the local ranking already has one to three files far ahead, answer with it and do not ask the decision model. |

## Failing open, privacy and budget

It always answers. With no key, private mode, the daily budget, a backend cool-off, no answer within `timeoutMs`, or a failing backend, the local ranking comes back, labelled as such. A card or query that looks like it holds a secret is not sent; cards are redacted. The model's `identifiers` and `synonyms` only steer the local scoring and the lines on each card; they are never sent. The symbol lookup sends nothing.

## Limits

- Only the first 20,000 files git lists are scored; a walk without git stops after 5,000.
- The local ranking is word matching, so a description with none of the code's words may miss the file; `identifiers` and `synonyms` are how the model widens it.
- The shortcut trusts words: a file whose name and header say the query's words, far ahead of the rest, is answered without a judge.
- The symbol rules are regular expressions, not a parser: a call through another object with a method of the same name is still listed as a call (marked "as a member"), and a definition written in an unusual shape may be read as a use. Each line comes with its text so the model can tell. At most 400 files holding the word are read, and at most 40 lines are listed per role.

## Benchmarks

**Task level: against plain Claude Code.** One task is a question a person asks about a codebase, asked once with `claude -p` in a fresh copy of a project. Two suites:

- **The small fixture** (ten tasks): tillbox, a TypeScript billing and orders API of 320 files (`bench/task-fixture/`, made by `bench/task-fixture-gen.py`): "which file defines the retry schedule for webhook deliveries?", "what calls refundPayment?", "find every place that reads TAX_RATE", "which migrations change the invoices table?", with near-misses that share the words of each answer (a retry policy for payment calls, a rounding helper, `TAX_RATE_OVERRIDE`, `refundPaymentLater`, the signing side of the webhooks, a table named like `invoices`). The questions share the code's words, so grep leaves little to win: both arms were right on all ten.
- **The large project** (thirteen tasks, ids `saleor-*`, `bench/task-repo.ts`): [Saleor](https://github.com/saleor/saleor) 3.23.0 (commit `e11a5557eff2`, BSD-3-Clause), an e-commerce API in Python of about 4,500 files, cloned at that commit once per run into the run's scratch folder and hard-linked into each arm's project (never vendored here). Its questions are the kind grep is worst at:

| case | what it tests |
|---|---|
| `saleor-guest-cart-expiry` | paraphrase: "a shopper who is not signed in" for anonymous checkouts; the user and empty-cart periods 3 and 6 lines below are near-misses |
| `saleor-webhook-proof` | paraphrase: "a proof that the request comes from the shop" for the payload signature; the Stripe and JWT signature code are near-misses |
| `saleor-stock-hold` | paraphrase: "held back from other shoppers" for stock reservations; the reservation-expiry task is a near-miss |
| `saleor-giftcard-expiry` | paraphrase: "a prepaid store-credit card" for a gift card; vouchers (discount codes) and `is_gift_card_expired` are near-misses |
| `saleor-unpaid-orders` | paraphrase: "marked as lapsed" for expired orders; the Celery task that calls it and `delete_expired_orders_task` are near-misses |
| `saleor-failing-app-share` | paraphrase: the circuit breaker's failure percentage, not named; its recovery twin 6 lines below is the near-miss |
| `saleor-picture-resize` | paraphrase, two files: the thumbnail view and the image processing, not models, signals or the GraphQL side |
| `saleor-refund-callers` | callers among homonyms: `order_refunded` is also a plugin-manager method, a webhook-plugin method, a GraphQL field and a string |
| `saleor-checkout-total-callers` | callers among near names: not `..._with_gift_cards`, not `_calculate_checkout_total`, not `manager.calculate_checkout_total` |
| `saleor-order-created-def` | which of five `order_created` definitions checkout completion calls (follow the import) |
| `saleor-none-loyalty` | no right answer: loyalty points do not exist |
| `saleor-none-sms` | no right answer: no text messages are sent; e-mail notifications are the near-miss |
| `saleor-none-captcha` | no right answer: no CAPTCHA anywhere; account creation and its throttling are near-misses |

- **Arms:** plain Claude Code (find-files off) searches with its own tools: Glob, Grep, Read, Explore agents, whatever it picks. Claude Code with find-files on is also offered `find_files`. The prompt is the same and never mentions the tool, so whether the model reaches for it is part of the result: each row's `tool_calls` says how many times it called `find_files` and how each call was answered (`jev`, `clear`, `local`, `symbol`), read from the bench ledger, so a call that asked no decision model still counts.
- **Answer and checker:** the reply ends with an `ANSWERS` block, one `path` (or `path:line`) per line; on the large project, `NONE` when nothing in it does what is asked. The checker, in code, compares it with the gold: precision and recall of the files (of file:line, within two lines, for the questions that ask for lines). Score is F1; success is every gold item found and nothing else. A question with no gold is right only when nothing is answered.
- **Gold:** read from the code at the pinned commit; `task-check.ts --repo` checks it against a fresh clone (each gold line matches its pattern, and the greps that would find a wrong answer find only the gold) and runs both arms on a stand-in `claude` in the linked clone.
- **Measured:** accuracy, wall time, Claude's cost, the decision model's cost, the total, and, per suite, how often `find_files` was called (the report's "By suite" table).

```bash
bun src/features/find-files/bench/task-check.ts                 # the small fixture against the gold, and a free fake run
bun src/features/find-files/bench/task-check.ts --repo          # the large project: clones it (about 100 MB), checks the gold, a free fake run
bun src/bench/run.ts find-files --level task --backend openrouter --claude-arg --plugin-dir --claude-arg "$PWD"                        # the plan, both suites
bun src/bench/run.ts find-files --level task --backend openrouter --cases 'saleor-*' --claude-arg --plugin-dir --claude-arg "$PWD"     # the plan, the large project
bun src/bench/run.ts find-files --level task --backend openrouter --cases 'saleor-*' --claude-arg --plugin-dir --claude-arg "$PWD" --yes   # spends money
```

The plan for the large project: 26 headless Claude calls (13 questions × 2 arms), about $11.70 of Claude at $0.45 a question and under $0.02 of decisions. A smoke run of two of its questions (`saleor-refund-callers`, `saleor-giftcard-expiry`) cost $0.54 of Claude in all ($0.10 to $0.20 a call, 8 to 13 s each); both arms were right on both, and the model with find-files on did not call it. The run's scratch folder keeps the clone (about 110 MB with every arm's links) for inspection.

<!-- bench:start -->
**Bench** (`bun src/bench/report.ts find-files`; 0.11.0@14f7f68, 0.14.0@8d6d53a).

- **One case:** a plain-words question about a made-up shop project (about 75 files), such as "where do we apply discounts", with the files that implement it.
- **Measured:** the order Jev lists the files in: of the first k files returned, how many are the implementing ones, and how many implementing files are missed. Some queries have no right file, which measures the noise returned.
- **The setting:** how many files the tool returns (it has no relevance bar). Fewer files is less for the model to open; more files misses fewer. (`limit`, default 10)

**Compared with plain Claude Code:**

![task](bench/results/task.svg)

| arm | runs | success | mean score | median time | total time | Claude cost | feature decision cost | other jev-mod decision cost | total cost |
|---|---|---|---|---|---|---|---|---|---|
| plain Claude Code | 23 | 100.0% | 100.0% | 11.4 s | 277.5 s | $0.102 | $0 | $0 | $0.102 |
| jev-mod openrouter | 23 | 95.7% | 98.6% | 11.5 s | 269.5 s | $0.105 | $0.00008 | $0.00002 | $0.105 |

- success: the share of scored runs the checker marked right; mean score: its partial credit (the share of questions answered right, say).
- median time: over scored runs; total time: every run of the arm, failed ones too.
- costs are per scored run. Feature decision cost: what find-files's own decisions cost; other jev-mod decision cost: what other jev-mod features still asked in the arm (a protective feature the bench may not switch off, as the person has it). Total cost is Claude plus both. A failed run is never scored.
- plain Claude Code runs with jev-mod switched off whole, so it makes no decisions; a plain run that shows any is an error (`decisions_in_plain_arm`). Runs from jev-mod 0.12.0 and before switched off only the features that change what the model sees.

- jev-mod openrouter: right on 95.7% (plain Claude Code 100.0%) of runs, median 11.5 s (plain Claude Code 11.4 s), $0.105 (plain Claude Code $0.102) per run (Claude $0.105, find-files's decisions $0.00008, other jev-mod decisions $0.00002).

| arm | question context | kept / dropped | tool pairs dropped / trimmed | compaction time | question time | Claude tokens |
|---|---|---|---|---|---|---|
| plain Claude Code | 65.6k | – | – | – | 11.4 s | 66259 |
| jev-mod openrouter | 68.6k | – | – | – | 11.5 s | 69316 |

- question context: what the last step read, in tokens (a smaller one is a compaction that worked); kept / dropped: messages the compaction kept and dropped, of those before it; tool pairs dropped / trimmed: tool calls dropped with their results, and results cut down, with the characters that took out (each pair saved in full to a file); compaction time and question time: the median wall time of the compaction step and of the question step, over every run (no compaction has no compaction step).

Spend in all: $4.781 Claude; $0.00243 decisions. A failed run is never scored, but its spend counts here.

**By suite.** The small fixture (tillbox, 320 files) and the large project (saleor 3.23.0, ~4,500 files) apart; find_files calls are read from the ledger, so a call that asked no decision model still counts.

| suite | arm | runs | success | mean score | median time | Claude $/run | decisions $/run | runs that called find_files | find_files answers |
|---|---|---|---|---|---|---|---|---|---|
| large project | claude | 13 | 100% | 100% | 11598 ms | $0.113 | $0.00000 | 0 of 13 | - |
| large project | jev-mod openrouter | 13 | 100% | 100% | 11588 ms | $0.118 | $0.00002 | 0 of 13 | - |
| small fixture | claude | 10 | 100% | 100% | 10185 ms | $0.089 | $0.00000 | 0 of 10 | - |
| small fixture | jev-mod openrouter | 10 | 90% | 97% | 11473 ms | $0.089 | $0.00022 | 6 of 10 | clear 1, jev 4, symbol 1 |

**Decision level.** Jev answers each case by itself, and the bench replays its answers at every value of `limit`. Best = peak F2 (recall counts double); a tie goes to the lower value: a lower limit returns fewer files for the model to open and read; the cost is a miss when the right file ranks below it.

**What this means.** At the default 10, the files returned are the right ones (accuracy over every candidate file) on 73.4%, over 48 queries; at the best value found, 1, the same score is 99.2%. The shipped default (10) is not the best value found (1). Not yet changed.

![accuracy](bench/results/accuracy.svg)
![effect](bench/results/effect.svg)
![cost-latency](bench/results/cost-latency.svg)

| backend · model | cases | best | accuracy | precision | recall | F1 | candidates returned | queries with a hit | local-only F1 | gold the local step missed | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 48 | 1 | 99.2% | 95.7% | 97.8% | 96.8% | 12.6% | 1 | 0.903 | 0.022 | 463 ms | 546 ms | $0.00006 |

- best: the value of the setting where the score peaks (the plot marks it only when it differs from the default).
- accuracy: the share of items where acting or not acting matched the label.
- precision: when the feature acts, how often acting was right.
- recall: of what it should have acted on, how much it did.
- F1: precision and recall in one number.
- candidates returned: the share of items the feature acts on, at the best value.
- queries with a hit: an extra measure, at the best value.
- local-only F1: an extra measure, at the best value.
- gold the local step missed: an extra measure, at the best value.
- p50, p95: how long a decision call took (the middle one, and the slow end); cost/case: what the decision calls cost per case.

Best per backend:

- openrouter · typesafe/jev-1.13-20260917: limit 1 (accuracy 99.2%; default 10: 73.4%)
<!-- bench:end -->
