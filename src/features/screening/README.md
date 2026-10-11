# Screening

Withholds instructions aimed at an AI from text the model is about to read.

Modes: `on`, `shadow`, `off`. Default: `on`. It guards you, so a project's file may only make its mode stricter (off < shadow < on) than your own file or the default give. The older *Screening* field in `/config` and jev-skills' `hook_screen` switch still work when no file sets this feature.

## What it decides

Which sentences, or passages, in a tool result are instructions aimed at an AI. They are withheld before Claude reads them, and the rest of the result is kept.

## When it runs

After these tools return, failed calls included:

- WebFetch and WebSearch;
- MCP tool results;
- Bash commands that fetch or show other people's text: `curl`, `wget`, `xh`, `http`, `https`, `lynx`, `w3m`, `links`, `aria2c`, `gh api`, `gh search`, `gh issue/pr view|list|status`, `gh pr diff|checks`, `gh run view`, `gh release view|list`, `gh gist view`, `gh discussion view|list`, also behind `env`, `timeout`, `xargs`, `sudo` or `bash -c`. Both stdout and stderr are screened, and a failing curl can still print a hostile page.

## How it decides

- **Local patterns** read every text at any length. A sentence they recognise as an instruction aimed at an AI is replaced; the rest stays.
- **The decision model** judges texts of 200 characters or more, the first 8 long texts of a result. A passage only it flags is withheld whole, up to 900 characters. It flags a passage when its injection score is at least `webscreen.injection_threshold` (0.5; a named backend can set its own in `tuning`).
- A result with more than 8 long texts says how many later ones were screened locally only: "the decision backend screened only the first 8 texts of this result; N more long text(s) were screened by the local patterns alone".
- A large Bash output that Claude Code kept in a file is screened whole before any of it is inlined, so [output trimming](../trim-output/README.md) never reads unscreened text. When it cannot be screened, Claude Code's preview stays and the full text is not inlined.
- shadow: screened and counted (`would-withhold`), nothing withheld; the request is made in line, as in `on`. `on` counts `withheld`, and the band shows `🛡 withheld N`.

## Settings

The mode only. A project's file cannot lower it, and `/jev-mod screening ... --project` and the dashboard refuse to write a looser one.

## Failing open, privacy and budget

Screening is the one decision that does not simply pass the text on when the decision model does not answer: it falls back to the local patterns. That holds in private mode (fetched text is screened locally only), during a backend cool-off, and past the daily budget. Texts are redacted before they are sent.

## Limits

- Local patterns catch the phrasings they know; the decision model reads only texts of 200 characters or more, and only the first 8 per result.
- A large fetched Bash output it could not screen is not inlined in full.

## Benchmarks

<!-- bench:start -->
**Bench** (`bun src/bench/report.ts screening`; 0.11.0@14f7f68).

- **One case:** a tool result (a fetched page, a search reply, an MCP result), cut into passages, each labelled: carries instructions aimed at an AI assistant (withhold it) or does not.
- **Measured:** whether Jev withholds the passages that hold injected instructions and lets the rest through. Reading an injection is the costly mistake; withholding harmless text costs little.
- **The setting:** how likely Jev must find a passage to be an injection before it is withheld. Lower withholds more. (`injection`, default 0.5)

**Compared with plain Claude Code: not yet.** No task-level run of this feature (a real Claude Code session with it off, then on, on the same task) has been made.

**Decision level.** Jev answers each case by itself, and the bench replays its answers at every value of `injection`. Best = where accuracy peaks; a tie goes to the lower value: a lower bar withholds more, and a withheld harmless passage costs less than an injection the model reads.

**What this means.** At the default 0.5, Jev withholds or passes the right passages on 91.2% of the passages over 57 tool results; at the best value found, 0.65, the same score is 94.7%. The shipped default (0.5) is not the best value found (0.65). Not yet changed.

![accuracy](bench/results/accuracy.svg)
![effect](bench/results/effect.svg)
![cost-latency](bench/results/cost-latency.svg)

| backend · model | cases | best | accuracy | precision | recall | F1 | texts withheld | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 57 | 0.65 | 94.7% | 100.0% | 87.0% | 93.0% | 35.1% | 452 ms | 525 ms | $0.00001 |

- best: the value of the setting where the score peaks (the plot marks it only when it differs from the default).
- accuracy: the share of items where acting or not acting matched the label.
- precision: when the feature acts, how often acting was right.
- recall: of what it should have acted on, how much it did.
- F1: precision and recall in one number.
- texts withheld: the share of items the feature acts on, at the best value.
- p50, p95: how long a decision call took (the middle one, and the slow end); cost/case: what the decision calls cost per case.

Best per backend:

- openrouter · typesafe/jev-1.13-20260917: injection 0.65 (accuracy 94.7%; default 0.5: 91.2%)
<!-- bench:end -->
