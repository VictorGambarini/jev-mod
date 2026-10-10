# The jev-mod band (`band`)

One line above the prompt: what jev-mod decided this turn, its cost this session, what screening withheld, and which backend answered.

Modes: `on`, `off`. Default: `on`. The older *jev-mod band* field in `/config` still works when no file sets this feature. Turn it off with `"band": {"mode": "off"}` in your config file, or `/jev-mod band off`.

## What it decides

Nothing; it shows what the other features decided. It makes no request and costs nothing.

## When it runs

Always, once the mod has done something this session. Before that it reads `🧭 jev-mod ready · judges your next prompt`, or `🧭 jev-mod ready` when routing and skills are both off. While the user's config file does not exist it reads `nothing on yet · /jev-mod dashboard to choose`, and one toast says the same at the start of each session; the first save from the dashboard or `/jev-mod` creates the file and both stop.

## How it reads

```text
🧭 easy → haiku 4.5  $0.0043 (112)  🛡 withheld 2  🔌 jev-1.13 · typesafe
```

- **Lane.** Read as difficulty: easy, normal, hard, critical (small, medium, high, escalate). Then the model and effort the mod switched to (`→`), or `· kept` when it changed nothing. `untuned` marks a named backend the lane policy was not tuned for. `not routed` says why when it is known: your `/model`, or a Jev version drift (`not routed · Jev 1.14 ≠ tuned 1.13`).
- **Cost.** This session's spend and the number of decision calls: `$0.0043 (112)`.
- **`🛡 withheld N`** (red): what screening withheld.
- **`🔎 cut 7 · 12.3k chars`**: what the web filter cut (`would cut` in shadow).
- **The browser's line** while a run is going.
- **`🔓 ssh`** (yellow): the access categories this session has opened, so an open door is always in sight.
- **`🔌 jev-1.13 · typesafe`**: which backend answered. Red, with the reason and when it will retry, while it is failing (`✗ auth_failed (key refused)`, `out of credit`, `model loading`). `⚠ yes/no pinned` (yellow) while a named backend's yes/no answers look clamped (see *Decision backends* in the main README).

## Settings

The mode only.

## Failing open, privacy and budget

It only draws what the mod already recorded.

## Limits

One line; it cannot show every feature's activity. The dashboard has the rest.

## Benchmarks

<!-- bench:start -->
No benchmark has been run yet for the band. How benchmarks are run and recorded: [src/bench/README.md](../../bench/README.md).
<!-- bench:end -->
