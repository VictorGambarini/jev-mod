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
  cost and tokens, and the decision model's cost are recorded, and so is the shared setup's cost.

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
`trim-output` (sweeps `notNeeded`); `rules-gate`, `tool-gate`, `stop-gate`, `web-filter` and
`review-triage` (each sweeps `minConfidence`); `screening` (sweeps `injection`); `routing` (sweeps
`smallConfidence`); `skills` (sweeps `match`); `find-files` (sweeps `limit`); `browser` (sweeps
`confirmConfidence`); and `access-gate` (no threshold: it reads calls locally). Every bench's
plots and tables at once: `bun src/bench/report.ts all`.

A task-level comparison, jev-mod against plain Claude Code. Without `--yes` it prints the plan
(the arms, how many Claude calls, an estimate with the shared setup in it) and runs nothing:

```bash
bun src/bench/run.ts compact --level task --backend typesafe --sweep drop=0.6:0.9:0.1
bun src/bench/run.ts compact --level task --backend typesafe --sweep drop=0.6:0.9:0.1 --yes
bun src/bench/report.ts compact
```

Options: `--cases id,id` (a subset), `--set name=value` (a setting the adapter reads, recorded
with each row), `--timeout ms` (per decision request, default 20000). Task level only:
`--usd-per-call n` (prices every Claude call alike in the estimate; without it, each step has its
own price), `--max-usd-per-call n` (passed to each `claude -p` as `--max-budget-usd`; default the adapter's, else 2; `compact`'s is 8, since one long setup prompt or a question on its full context costs a few dollars), `--claude-arg <arg>` (repeatable, passed on to `claude`, such as
`--claude-arg --model --claude-arg sonnet`, or `--claude-arg --plugin-dir --claude-arg .` to run
this checkout where jev-mod is not installed).

### What it costs

| Run | Calls | Cost |
|---|---|---|
| Decision level, `compact`, one backend | 10 requests, about 15k input tokens | about $0.0006 at Jev's list price; $0 on a free tier or your own server |
| Decision level, `trim-output` / `rules-gate` | 4 / 8 requests, about 13k / 5k tokens | under $0.001 each |
| Decision level, `screening` / `web-filter` / `tool-gate` / `stop-gate` / `access-gate` | about 45 / 19 / 62 / 42 / 0 requests (stop-gate's carry up to about 6k characters of evidence each) | pennies at most at Jev's list price; not yet measured |
| Decision level, `routing` / `skills` / `find-files` | 81 / 118 / about 47 requests, about 42k / 85k / 51k tokens | under $0.004 each |
| Decision level, `review-triage` / `browser` | 51 / 96 requests (a diff and its seven questions; a snapshot's step, confirm and page-check questions) | pennies at most at Jev's list price; not yet measured |
| Task level, `routing`, one backend | 20 headless Claude calls (10 tasks × 2 arms, no setup), about 10 decision calls | Claude: about $14.50 (plain on Opus: about $0.30 a trivial task, $0.80 medium, $1.50 hard; routed: $0.10, $0.50, $1.50); decisions: about $0.01. The smoke (`--cases lb-conversion`, both arms): $0.37 of Claude, $0.0004 of decisions, about a minute |
| Task level, `skills`, one backend | 20 headless Claude calls (10 cases × 2 arms, no shared setup), about 20 decision calls | Claude: about $6 (about $0.30 a run; the first smoke run was $0.36 plain and $0.25 with the feature, about 30 s each); decisions: under $0.01. One case (`--cases adr-queue`): about $0.60 |
| Task level, `compact`, one backend, `drop=0.6:0.9:0.1` | 69 headless Claude calls (36 shared setup, then 11 per case), about 48 decision calls | Claude: about $105 (setup about $12.80 a case: twelve prompts building ~105k tokens of conversation; per case, a question on the full context about $2.50, `/compact` about $2.90 then its question about $0.70, the mod's compaction about $2.50 then its question about $1.55; the plan prints how it priced them); decisions: about $0.02. One case (`--cases proration-fix`): about $35 |

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
  (one small file per call: feature, calls, cost, model, error), which the runner adds up, and
  where `/jev-mod compact` writes what each compaction did (`compaction-*.json`: messages before,
  kept, dropped, and why nothing went when nothing did): the bench's proof that it compacted.

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
| `compact` | `drop` (default 0.7) | message outside the last six | accuracy, precision, recall, F1, share dropped, keep messages lost | peak accuracy | higher: keeps more, and a dropped message cannot be had back |
| `trim-output` | `notNeeded` (default 0.9) | log line | accuracy, share cut, gold lines lost | fewest gold lines lost, then most cut | higher: cuts fewer blocks |
| `rules-gate` | `minConfidence` (default 0.8) | rule | accuracy, precision, recall, F1, share refused | peak accuracy | higher: refuses fewer edits, and the mod fails open |
| `screening` | `injection` (default 0.5; `webscreen.injection_threshold`) | text unit of a tool result | accuracy, precision, recall, F1, share withheld | peak accuracy | lower: withholds more, and a withheld harmless passage costs less than an injection the model reads |
| `web-filter` | `minConfidence` (default 0.8) | search result or fetched chunk | accuracy, precision, recall, F1, share dropped | peak accuracy | higher: drops fewer results and parts, and a dropped one is gone from what the model reads |
| `tool-gate` | `minConfidence` (default 0.7; `offMachineConfidence` stays at its default) | tool call | accuracy, precision, recall, F1, share held, held in error, missed holds | peak accuracy | higher: holds more hard-to-undo calls nothing asked for (a held call costs the person a question), and fewer on a stated limit |
| `access-gate` | none: the gate has no decision model | tool call | accuracy, precision, recall, F1, share refused, refused in error, missed | the one point | not applicable: every answer is 0 or 1 |
| `stop-gate` | `minConfidence` (default 0.7) | claims verdict, and a step the message stopped on | accuracy, precision, recall, F1, share sent back, accused shown, could-not-tell found, verdicts right | peak accuracy | higher: sends the agent back less often; a doubtful claim is only noted as unverified |
| `routing` | `smallConfidence` (default 0.7) | prompt | exact lane accuracy, small-lane precision, recall and F1, share routed to small, under-routed, over-routed, not routed, effort right | peak accuracy | higher: fewer prompts on the cheapest model, and a miss is a small model on work that needed more |
| `skills` | `match` (default 0.5; `need` held at 0.5) | prompt | accuracy, precision, recall, F1, share given a suggestion, right skill first, wrong skill suggested, unneeded suggestion | peak accuracy | higher: suggests less often, and a wrong suggestion costs a detour |
| `find-files` | `limit` (default 10) | candidate file | accuracy, precision, recall, F1, share returned, queries with a hit, F1 of the local ranking alone, gold the local step missed | peak F2 (recall counts double) | lower: fewer files for the model to open |
| `review-triage` | `minConfidence` (default 0.8) | change: quick only if every one of its questions reaches the bar | accuracy, precision, recall, F1, share called quick, full reviews skipped | peak accuracy | higher: answers quick less often; a full review costs time, a wrong quick skips one |
| `browser` | `confirmConfidence` (default 0.85) | consequential step (does the goal ask for it) and "done" (page check) | accuracy, precision, recall, F1, share proceeded, plus the step pick, goal_reached and stuck accuracy and consequential rows picked wrongly | peak accuracy | higher: stops before more consequential steps, and the person is asked |

A tie (within 0.001) goes to the safer side. Latency is reported as p50 and p95 per request.

Task level, per arm: the checker's success and score, wall time, Claude's cost and tokens (from
`claude -p`'s JSON), the models that answered and what each cost (`claude_models`, from its
`modelUsage`), the context the final step read (`context_tokens`), the decision model's
cost and calls (from the ledger), and what a compaction the mod recorded kept and dropped
(`compaction`). An arm that did not do its job is an error with the adapter's code (its `verify`),
never a score: for `compact`, `not_compacted` is any compacting arm (`/compact` or the mod's)
whose question read at least 90% of the no-compaction arm's context, or a jev-mod arm that
recorded no compaction (and made no request) or one that dropped nothing. Its context and
kept/dropped counts are still in the row and the table, as the reason. The table
shows each arm's failures by code. Each case's shared setup is a row of its own (`setup: true`,
arm `setup`), never scored; the summary's "Spend in all" line adds it to every arm's spend.

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

- `accuracy.svg`: accuracy against the threshold, one line per backend, the best point ringed.
  One dashed line marks `default <value>`, what jev-mod ships; a second, `best <value>`, only
  when the best value found differs from it;
- `effect.svg`: the share dropped, cut or refused against the threshold;
- `cost-latency.svg`: p50 and p95 latency and cost per case, per backend;
- `task.svg` (when there are task-level rows): success and score (accuracy), median wall time
  (speed), Claude, decision and total cost per run, plain Claude Code (orange) beside each
  jev-mod arm; compaction adds the context the question read and the messages dropped;
- `summary.md`: the same text as the README's bench section.

The section opens with the adapter's `explain` (what one case is, what is measured, what the
setting does), then "Compared with plain Claude Code" (a table of every arm, or "not yet"), then
the decision-level plots and table with "What this means", generated from the numbers.

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
   - `threshold`: its name, the default jev-mod ships, the sweep to draw, which side is safer and what
     that means, and where it is set; `keptBecause` says why the default stays when the best value
     found differs from it (empty: "not yet changed");
   - `explain`: `oneCase`, `measured`, `setting` and `result` (a sentence with `{pct}` and `{n}`),
     in plain words for someone who never saw the harness;
   - `judge(case, ctx)`: ask about one case the way the feature does, through `ctx.host` (call
     the feature's own functions, so the bench measures what ships), and return one item per
     judgement and the requests it made;
   - `evaluate(rows, threshold)`: the metrics at one threshold, from the rows alone
     (`itemMetrics` in `metrics.ts` when items are judged one by one);
   - `truth(case, state, question)`: the right answer, for the fake backend.
   A feature that picks among several options (a lane, a skill, a ranked list) still fits: each
   judgement is an item for the generic code, and `evaluate` computes the real metric from the
   row's `detail` (`routing`, `skills` and `find-files` do), so a sweep can re-apply the feature's
   own rules to recorded answers. The fake backend answers a choice question when `truth` returns
   an option's name.
3. A test beside it that runs it on the fake backend (`fakeHostFor` in `decision.ts`).
4. One line in `src/bench/features.ts`.
5. For a task level, a `TaskAdapter` (`compact/bench/task.ts` is the example): task cases (a
   fixture folder copied to a scratch project, made a git repository with `git: true`, setup
   prompts shared by every arm, an optional `setupUsd` estimate; `fresh: true` instead gives each
   arm its own copy of the fixture, for a task that edits it, as `routing/bench/task.ts` does), each arm's steps (a step may
   refuse tools and carry its own price for the estimate), its overlay, a checker, a `verify`
   that says when an arm plainly did not do its job, and optionally `maxUsdPerCall` and an
   `estimateNote` the plan prints under its estimate.

Then `bun src/bench/run.ts <name> --backend fake` and `bun src/bench/report.ts <name> --fake`.

## The worked examples

- `compact`: ten synthetic sessions (213 messages) labelled keep or drop, run through
  `keep.ts`'s units and `engine/compact.ts`'s requests; the drop bar swept. Its task level
  (`compact/bench/task.ts`, three cases on `task-fixture/`, twelve questions each): the fixture
  is ledgerline, a small billing codebase (a `billing/` package, unittest tests that run with
  `python3`, a CLAUDE.md, docs, a CI log, an app log and a month of invoices as CSV). Each case is
  a real coding session of twelve setup prompts, written the way a person talks: a bug fix
  (`proration-fix`), a feature (`credit-notes`) or an investigation (`webhook-signatures`);
  files read, tests run and failing, an approach tried and reverted, corrections, a constraint
  stated once, a decision with its reason, a ticket, an owner and a deadline in passing, and side
  work (whole logs and the CSV) that is most of the bulk: about 105k tokens of conversation over
  Claude Code's own ~28k. Each arm compacts its own fork (`/compact`, the mod's compaction at each
  drop bar, or none) and answers what a continuation needs (the constraints and corrections, the
  decisions and why, the failed approach and why, the files changed, the exact ids and commands)
  with every tool refused, so only what it kept counts; each answer must match every one of its
  patterns. A jev-mod arm sends `/compact [jev-mod compact: drop only what Jev marks drop]`, the
  compaction `/jev-mod compact` runs, in one step.
- `routing`'s task level (`routing/bench/task.ts`): ten one-prompt coding tasks in parcelkit
  (`task-fixture/`, a small Python courier codebase), four trivial, three medium, three hard, each
  in a fresh copy of the project per arm (`fresh: true`). Plain Claude Code runs every turn on its
  default model (Opus here); the jev-mod arm lets routing pick the model and effort. A hidden
  check per task plus the project's own tests decide success; each row names the models that
  answered and what each cost (`claude_models`). `routing/bench/task-report.ts` draws success, cost
  and wall time by difficulty; `routing/bench/task-selfcheck.ts` proves each check fair (fails as
  shipped, passes when fixed) and runs the runner end to end on a fake `claude`.
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
- `tool-gate`: 83 tool calls (pushes, deploys, deletes, MCP sends, writes outside the project, calls that break a stated limit, calls that carry a secret, and safe look-alikes) with what the person asked before them; the gate's `riskOf`, `stateOf`, `questionsFor` and `decide` are used as shipped, and `minConfidence` is swept.
- `access-gate`: 117 calls (ssh and its family, tunnels, remote databases, scans, key reads, session grants and loopback hosts, harmless look-alikes) through `concerns`, `hitsOf` and `judge`. It makes no request and has no threshold; it measures the pattern reading.
- `stop-gate`: 62 final messages with the turn's commands, outputs and tool results, labelled shown, not shown, could not tell, no claim of its own (progress, failure, plans, attributed results) and stopped short or not; `readClaims`, `evidence`, `stateOf`, `questionsOf`, the stop-short builders, `decide` and `decideShort` are the gate's own, and `minConfidence` is swept.
- `routing`: 81 prompts labelled with the lane they belong in (small, medium, high, escalate, or
  keep the current model), classified by `engine/lanes.ts` with the shipped lane policy. The
  sweep lays the policy's own rules (`policy.ts` `apply`) over the recorded readings with the
  small-lane bar moved. It picks one of five answers, so the headline accuracy is exact lane
  accuracy and the extra columns say which way the misses go (under-routed: a lane below the
  gold one; over-routed: above it). The session rules (follow-ups, corrections) are code, not
  decisions, and are not in it.
- `skills`: 72 prompts against a catalog of 38 synthetic skills, ranked by `engine/skills.ts`
  `pick` (topK 1, both stages). Gold is the list of right skills (empty when none fits). An item
  is positive when a skill is suggested and right when the top skill is a gold one, so a wrong
  suggestion counts against precision. Its task level (`skills/bench/task.ts`, ten cases on
  `task-fixture/`): harborview, a small order and refund service with 21 skills in `.claude/skills/`.
  Eight skills hold what a request needs (a changelog section rule, an ADR numbering script, a
  UTC incident format, migration locking rules, a flag script with a checksum, an error-code
  rule, locale conventions, how the logs count a failed request); the other thirteen overlap them
  or are decoys. Two requests need no skill. Both arms have the same skills installed: plain
  Claude Code picks on its own, the jev-mod arm has the skills feature on. Each arm works in its
  own copy of the project (`isolate`), a checker reads the files or the answer, and the row's
  `detail` says which skill was loaded (from the session's transcript). `task.check.ts` runs the
  checks against the real fixture: `bun src/features/skills/bench/task.check.ts`.
- `find-files`: 48 queries over a synthetic project of 77 files, run through the tool's own steps
  (git's list and counts from a small fake git, `narrow`, `askAbout`, `rank`, `render`). The tool
  has no relevance bar, so the swept number is how many files it returns. Each row also keeps the
  local ranking's order, so the table shows what the decision model adds over the local step.
- `review-triage`: 51 synthetic diffs (docs, renames, fixes with and without tests, auth, schema,
  concurrency, rule breaks, scope creep) with a gold yes/no per question, run through
  `requestOf` and `questionsOf`; the case is quick when all its questions are confident noes.
  The follow-up that names files is not benched: it changes no verdict.
- `browser`: 59 synthetic page snapshots with a goal, no browser and no website. The feature's
  own `buildTable`, `stepRequest`, `confirmRequest` and `doneRequest` build the questions; gold
  is the right next row, whether the goal is reached, stuck, and for a consequential row whether
  the goal asks for it. `confirmConfidence` is swept over the confirm and page-check answers;
  the other three are scored beside it as extra columns. The page-screening request is not made.

Seen in the first real run: `claude -p "/jev-mod compact"` compacts nothing, because the command
queues `/compact` from a timer and the `-p` process ends first (the host refuses a compaction
from a command's own hook). So the jev-mod arms send `/compact` with the mod's marker, which the
mod answers itself in the same process (`src/compact-command.test.ts` raises that event through
the engine). Not verified yet, as only a real run can show it: that this compacts a forked
headless session end to end; a run where it did not reads `not_compacted`, never a score.

## Tests

`claude plugin test .` runs them with the rest: `metrics.test.ts` (sweep maths, metrics,
percentiles, the recommendation), `results.test.ts` (JSONL round trip, the secret check),
`summary.test.ts` (README markers, the table, plots, the tuning snippet), `plan.test.ts` (arms,
the estimate, the `--yes` guard, the overlay), and each feature's `bench/*.test.ts`.
