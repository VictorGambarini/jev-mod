# The bench

How well each feature decides, on which decision backend, at which threshold, and what it buys
over plain Claude Code. Two levels:

- **Decision level** (cheap): fixed cases with gold labels. Each case is asked once, through the
  feature's own code path, and every answer's probability is recorded. A threshold sweep is then
  computed from those recorded answers, so sweeping 0.5 to 0.95 in steps of 0.05 costs one pass,
  not ten.
- **Task level** (end to end, expensive): real Claude Code, headless (`claude -p ...
  --output-format json`), on task cases. Arm A is plain Claude Code (the feature off); arm B is
  the feature on, for each backend and setting. A checker scores each run; wall time, Claude's
  cost and tokens, and the decision model's cost are recorded.

It runs with `bun` from the repository root, outside the mod. Nothing here is loaded by the mod.

## Run it

Try it first on the fake backend (no key, no network; results go to `bench/fake/`, labelled FAKE):

```bash
bun src/bench/run.ts compact --backend fake
bun src/bench/report.ts compact --fake
```

A real decision-level sweep on one backend (one pass; the sweep is computed by the report):

```bash
bun src/bench/run.ts compact --backend typesafe --sweep drop=0.5:0.95:0.05
bun src/bench/run.ts compact --backend laya --sweep drop=0.5:0.95:0.05      # a backend named in backends.json
bun src/bench/report.ts compact --suggest-tuning
```

Several backends in one go: `--backend typesafe,openrouter,laya`. The other benches:
`trim-output` (sweeps `notNeeded`), `rules-gate` (sweeps `minConfidence`), `screening` (sweeps `injection`) and `web-filter` (sweeps `minConfidence`). Every bench's
plots and tables at once: `bun src/bench/report.ts all`.

A task-level comparison, jev-mod against plain Claude Code. Without `--yes` it prints the plan
(the arms, how many Claude calls, an estimate) and runs nothing:

```bash
bun src/bench/run.ts compact --level task --backend typesafe --sweep drop=0.6:0.9:0.1
bun src/bench/run.ts compact --level task --backend typesafe --sweep drop=0.6:0.9:0.1 --yes
bun src/bench/report.ts compact
```

Options: `--cases id,id` (a subset), `--set name=value` (a setting the adapter reads, recorded
with each row), `--timeout ms` (per decision request, default 20000). Task level only:
`--usd-per-call n` (the estimate), `--max-usd-per-call n` (passed to each `claude -p` as
`--max-budget-usd`, default 1), `--claude-arg <arg>` (repeatable, passed on to `claude`, such as
`--claude-arg --model --claude-arg sonnet`, or `--claude-arg --plugin-dir --claude-arg .` to run
this checkout where jev-mod is not installed).

### What it costs

| Run | Calls | Cost |
|---|---|---|
| Decision level, `compact`, one backend | 10 requests, about 15k input tokens | about $0.0006 at Jev's list price; $0 on a free tier or your own server |
| Decision level, `trim-output` / `rules-gate` | 4 / 8 requests, about 13k / 5k tokens | under $0.001 each |
| Task level, `compact`, one backend, `drop=0.6:0.9:0.1` | 48 headless Claude calls (15 shared setup, then 11 per case), about 24 decision calls | Claude: about $5-10 at $0.10-0.20 a call (the plan prints the estimate); decisions: about $0.01 |

## Backends and keys

`--backend` takes `typesafe`, `openrouter`, `venice`, `zen`, a backend named in
`~/.config/jev/backends.json` (`laya`, `von`, `clef`, ...), `default` (whatever the mod would use),
or `fake`. The bench never reads a key: it sets `JEV_BACKEND` (and `JEV_PROVIDER` for a provider)
for its own requests and lets `engine/client.ts` find the key where the mod would: the key's
environment variable, the OS secret store, jev-skills' credentials file. One place is out of
reach: the key kept in Claude Code's plugin settings, which only a running session is handed. If
that is your only copy, export it for the run (`TYPESAFE_API_KEY=... bun src/bench/run.ts ...`)
or store it with `jev setup-key`. Before sending anything the bench checks that a provider has a
key and says where it comes from (never the key); a row answered by another backend than the one
asked for (`TYPESAFE_BASE_URL` reroutes the providers) is marked an error.

Task-level runs pass the backend to the headless session the same way, in its environment; the
mod in that session finds its key as it always does, plugin settings included.

## Settings in a headless run: the bench overlay

A task-level arm needs a feature on or off and a threshold set, without writing the person's
`~/.config/jev-mod/config.json`. The mod reads one more layer for that, only when
`JEV_MOD_BENCH_OVERLAY` names a JSON file (`src/core/bench-overlay.ts`):

```json
{"features": {"trim-output": {"mode": "on", "keepThreshold": 0.4}, "routing": {"mode": "off"}},
 "compact": {"dropConfidence": 0.8},
 "ledger": "/tmp/jev-mod-bench-x/case/ledger-3"}
```

- It sits above the user's and the project's files and below what the person locked: a kill
  file and *jev-mod on* unticked in `/config` still win.
- It never weakens a guard: a protective feature (screening, the gates) only gets stricter from
  it, the browser only lower, and neither takes its knobs from it.
- It never carries a key: an overlay with any field named like a key, token, secret, password or
  header is refused whole (and `/jev-mod` lists it as passed over).
- `compact.dropConfidence` (0.5-0.99) is the drop bar for `/jev-mod compact`, which has no
  setting of its own yet. `ledger` is a folder where the mod writes each decision call's cost
  (one small file per call: feature, calls, cost, model, error), which the runner adds up.

Each arm's overlay turns every other feature that changes what the model sees off, so arms
differ only in the feature under test; protective features stay as the person has them, the same
in every arm.

## What it measures

Per case, per backend: every item the decision model judged, as `gold` (acting on it is right:
drop it, refuse it, cut it) and `score` (the number the feature compares to its threshold; it
acts when score >= threshold); the latency of each request; input tokens; the cost the client
bills (0 for a named backend or a free tier).

Per threshold the report computes, per feature:

| Feature | Swept | Scored per | Metrics | Recommended | Safer side |
|---|---|---|---|---|---|
| `compact` | `drop` (0.7 today) | message outside the last six | accuracy, precision, recall, F1, share dropped, keep messages lost | peak accuracy | higher: keeps more, and a dropped message cannot be had back |
| `trim-output` | `notNeeded` (0.9 today) | log line | accuracy, share cut, gold lines lost | fewest gold lines lost, then most cut | higher: cuts fewer blocks |
| `rules-gate` | `minConfidence` (0.8 today) | rule | accuracy, precision, recall, F1, share refused | peak accuracy | higher: refuses fewer edits, and the mod fails open |
| `screening` | `injection` (0.5 today; `webscreen.injection_threshold`) | text unit of a tool result | accuracy, precision, recall, F1, share withheld | peak accuracy | lower: withholds more, and a withheld harmless passage costs less than an injection the model reads |
| `web-filter` | `minConfidence` (0.8 today) | search result or fetched chunk | accuracy, precision, recall, F1, share dropped | peak accuracy | higher: drops fewer results and parts, and a dropped one is gone from what the model reads |

A tie (within 0.001) goes to the safer side. Latency is reported as p50 and p95 per request.

Task level, per arm: the checker's success and score, wall time, Claude's cost and tokens (from
`claude -p`'s JSON), and the decision model's cost and calls (from the ledger).

## Results

`src/features/<feature>/bench/results/`, one JSONL file per run
(`decision-<backend>-<date>.jsonl`, `task-<backends>-<date>.jsonl`), one line per case (and per
arm at task level): jev-mod's version, the git sha (`-dirty` when the tree had changes), the date,
the level, the backend's name and model and the model that answered, the settings, the sweep
asked for, the case id, the outcome (and an error code, never a server's message), the items,
the latencies, the tokens and the cost. `src/bench/types.ts` (`Row`) is the schema.

Never in a row: a key, a request header, anything from the person's config. `results.ts` refuses
to write a row with a field named like a key or a header, or a text value the privacy rules would
mask. Case text is not stored either, only ids and structure: the cases are committed synthetic
data, and real session content is stored only if you put it in a case yourself.

The fake backend's results go to `bench/fake/decision-fake.fake.jsonl` (replaced on each run),
and its plots and summary are named `*-fake.svg` and `summary-fake.md`, with FAKE in every title.
Its answers lean toward the gold label with deterministic noise: they show that the pipeline
works and say nothing about any model.

## Report

`bun src/bench/report.ts <feature|all> [--fake] [--suggest-tuning] [--readme]` reads the
folder's JSONL files and writes beside them:

- `accuracy.svg`: accuracy against the threshold, one line per backend, the recommended point
  ringed, today's default dashed;
- `effect.svg`: the share dropped, cut or refused against the threshold;
- `cost-latency.svg`: p50 and p95 latency and cost per case, per backend;
- `task.svg` (when there are task-level rows): success, wall time, Claude cost and decision cost
  per arm, plain Claude Code beside jev-mod;
- `summary.md`: the table, and a line per backend with its recommended threshold.

The plots are plain SVG with their own background, legible in light and dark themes
(`prefers-color-scheme`), with no dependency. The same table and plots go into the feature's
`README.md` between `<!-- bench:start -->` and `<!-- bench:end -->`, only if both markers are
there; fake results go there only with `--readme`.

`--suggest-tuning` prints the recommended thresholds as settings to paste, and writes nothing:
a backends.json `tuning` entry per named backend when the threshold is a tuning key, the
`/jev-mod <feature> <setting> <value>` command when it is a jev-mod setting (one value for every
backend), or a note when the mod has no setting for it yet (`compact`'s drop bar is
`DROP_CONFIDENCE` in `src/engine/compact.ts`; `trim-output`'s test-log bar is `NOT_NEEDED` in
`src/features/trim-output/testlog.ts`).

## Write a bench

1. `src/features/<name>/bench/cases.ts`: synthetic cases with gold labels.
2. `src/features/<name>/bench/adapter.ts`, a `DecisionAdapter` (`types.ts`):
   - `threshold`: its name, today's default, the sweep to draw, which side is safer and what
     that means, and where it is set;
   - `judge(case, ctx)`: ask about one case the way the feature does, through `ctx.host` (call
     the feature's own functions, so the bench measures what ships), and return one item per
     judgement and the requests it made;
   - `evaluate(rows, threshold)`: the metrics at one threshold, from the rows alone
     (`itemMetrics` in `metrics.ts` when items are judged one by one);
   - `truth(case, state, question)`: the right answer, for the fake backend.
3. A test beside it that runs it on the fake backend (`fakeHostFor` in `decision.ts`).
4. One line in `src/bench/features.ts`.
5. For a task level, a `TaskAdapter` (`compact/bench/task.ts` is the example): task cases (a
   fixture folder copied to a scratch project, setup prompts shared by every arm), each arm's
   steps, its overlay, and a checker.

Then `bun src/bench/run.ts <name> --backend fake` and `bun src/bench/report.ts <name> --fake`.

## The worked examples

- `compact`: ten synthetic sessions (213 messages) labelled keep or drop, run through
  `keep.ts`'s units and `engine/compact.ts`'s requests; the drop bar swept. Its task level
  (`compact/bench/task.ts`, three cases on `task-fixture/`) is scaffolded and not yet run: a
  session is built from setup prompts, each arm compacts its own fork (`/compact`,
  `/jev-mod compact` at each drop bar, or no compaction), then answers questions whose answers
  were given early.
- `trim-output`: the four test logs that were `evals/trim-tests/`, with "keep failures only" as a
  baseline that needs no backend. `pipeline.test.ts` still holds the old benchmark's numbers.
- `rules-gate`: eight edits against 23 written rules.
- `screening`: 57 tool results (fetched pages, search snippets, MCP results, fetching Bash output),
  23 carrying instructions aimed at the model and the rest not, among them README install steps,
  docs about prompts and an article on prompt injection; `engine/screen.ts`'s `screenResult`, with
  `targets.ts`'s `kindOf`. The tuning key `webscreen.injection_threshold` swept.
- `web-filter`: 12 searches (a query, the request, 7 to 8 results) and 7 long pages (about 8,000
  characters, as sections that the question needs or not), asked with `filter.ts`'s own triage,
  chunks and requests; the first `keepTop` results, repeated URLs, named hosts and the chunks kept
  without asking are not scored. It judges relevance, not injection: screening runs before it.

Not verified yet, as only a real run can show it: that `claude -p --resume <id> --fork-session`
with `/compact` or `/jev-mod compact` compacts a headless session (the mod queues `/compact` from
a timer, which a `-p` process may exit before). An arm whose compaction did nothing shows it:
its tokens and answers match the no-compaction arm's.

## Tests

`claude plugin test .` runs them with the rest: `metrics.test.ts` (sweep maths, metrics,
percentiles, the recommendation), `results.test.ts` (JSONL round trip, the secret check),
`summary.test.ts` (README markers, the table, plots, the tuning snippet), `plan.test.ts` (arms,
the estimate, the `--yes` guard, the overlay), and each feature's `bench/*.test.ts`.
