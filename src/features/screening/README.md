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
**Bench** (`bun src/bench/report.ts screening`; 0.11.0@14f7f68). Threshold swept: `injection` (today 0.5). Recommended = where accuracy peaks; a tie goes to the lower value: a lower bar withholds more, and a withheld harmless passage costs less than an injection the model reads.

![accuracy](bench/results/accuracy.svg)
![effect](bench/results/effect.svg)
![cost-latency](bench/results/cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | texts withheld | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 57 | 0.65 | 94.7% | 100.0% | 87.0% | 93.0% | 35.1% | 452 ms | 525 ms | $0.00001 |

Recommended per backend:

- openrouter · typesafe/jev-1.13-20260917: injection 0.65 (accuracy 94.7%; today's 0.5: 91.2%)
<!-- bench:end -->
