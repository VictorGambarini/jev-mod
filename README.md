# jev-mod

**A Claude Code mod that hands the small decisions to a cheap decision model.**

Your agent spends frontier-model time on things that are not thinking: which model should
answer this turn, which of your skills applies, which parts of a long session still matter,
whether a fetched page is trying to give it orders. Those are decisions, not prose. jev-mod
asks a decision model (Jev, or any backend you run) and lets Claude do the work.

It runs inside Claude Code as a mod: hooks that reach the engine where settings hooks cannot.

| Feature | When | What it decides | Default |
|---|---|---|---|
| [Routing](src/features/routing/README.md) | each turn | The lane (small / medium / high / escalate) that sets the turn's effort and model. | off |
| [Skills](src/features/skills/README.md) | each prompt | The one installed skill the prompt needs, if any. | off |
| [Screening](src/features/screening/README.md) | after web, MCP and fetching Bash results | Which text in them is instructions aimed at the AI, withheld before Claude reads it. | on |
| [Tool-call gate](src/features/tool-gate/README.md) (`tool-gate`) | before a consequential tool call | Whether the call should be put to you first. | off |
| [Completion gate](src/features/stop-gate/README.md) (`stop-gate`) | when the main agent ends a turn | Whether a "done" claim is shown by the evidence, and whether the turn stopped short of a step you asked for. | off |
| [Rules gate](src/features/rules-gate/README.md) (`rules-gate`) | before an edit inside the project | Whether the edit breaks a rule written in the project. | off |
| [Access gate](src/features/access-gate/README.md) (`access-gate`) | before a call that reaches another machine | Whether the call may reach another machine this session (no decision model). | off |
| [Output trimming](src/features/trim-output/README.md) (`trim-output`) | after a long Bash output | Which parts of it the current goal needs. | off |
| [Web filter](src/features/web-filter/README.md) (`web-filter`) | after WebSearch and long WebFetch | Which results and page parts the question needs. | off |
| [Find files](src/features/find-files/README.md) (`find-files`) | when the model calls `find_files` | Which files implement what the model describes. | off |
| [Review triage](src/features/review-triage/README.md) (`review-triage`) | when the model calls `review_triage` | Whether a diff needs a quick or a full first review pass. | off |
| [Browser](src/features/browser/README.md) (`browser`) | when the model calls `browse` | Each step of a web run toward a goal. | off |
| [The band](src/features/band/README.md) | always | Nothing; it shows what jev-mod decided, its cost and the backend. | on |
| [`/jev-mod compact`](src/features/compact/README.md) | when you type it | Which messages to drop in a compaction with no summary. | none (a command) |
| [`/jev-mod dashboard`](src/features/dashboard/README.md) | when you type it | Nothing; a page to see and set every feature. | none (a command) |
| [`/jev-mod status`](src/features/status/README.md) | when you type it | Nothing; the backend, key source, a live check and each feature's mode. | none (a command) |

Each feature's page says what it decides, when it runs, how it decides, its settings, how it fails open, and its limits. How the features are benchmarked: [src/bench/README.md](src/bench/README.md).

One command manages the mod; the typeahead offers each word after it:

| Command | What it does |
|---|---|
| `/jev-mod` (or `/jev-mod list`) | Every feature: its mode and where that came from, its settings, then anything in the config files that was passed over. |
| `/jev-mod status` | The backend (and whether it is on this machine), where its key came from (never the key), a live check naming the backend and model that answered, any warning about its answers, each feature's mode, today's spend. |
| `/jev-mod compact` | The compaction above. Headless (`claude -p`), send `/compact [jev-mod compact: drop only what Jev marks drop]` instead. |
| `/jev-mod dashboard` | A page in your browser to see and set every feature (below); `/jev-mod dashboard stop` ends it. |
| `/jev-mod <feature>` | Its help, its modes, and each setting with its range, default and value now. |
| `/jev-mod <feature> on\|off\|shadow` | Sets its mode in your config file (`--project`: the project's). |
| `/jev-mod <feature> <setting> <value>` | Sets one of its settings. |
| `/jev-mod <feature> reset` | Clears what the file sets for it. |
| `/jev-mod access` | The access gate: each category, blocked or allowed this session. `/jev-mod access <category> on [host]` allows one for this session (only typed by you at the prompt), `off` blocks it again, `/jev-mod access all off` closes them all. |
| `/jev-mod browser install` | Installs Playwright (a pinned version) and its Chromium into `~/.cache/jev-mod/browser/` for the `browse` tool; about 150 MB, needs `npm`. Only ever run when you ask. |

After a change it shows the value that now holds, and warns when a kill file, `/config` or the
project file still overrides what was just written.

Every decision fails open: no answer means the turn runs exactly as plain Claude Code. The one exception is screening, which falls back to the local patterns when the decision model does not answer, and which does not inline the full text of a large fetched Bash output it could not screen (Claude Code's preview stays). After a
failed call the mod stops asking for five minutes, so a backend that is down costs one timeout;
a server on this machine that is still loading its model pauses it for seconds instead (below).
A refused key or an account out of credit stops it for thirty minutes, or until a call answers
again (`/jev-mod status` checks at once after you replace the key). Every call, the status check
included, counts against the daily budget; past it, screening screens locally.

## What you need

- Claude Code (terminal or the desktop app's Code tab).
- A key for a decision model: a TypeSafe key for Jev (https://console.typesafe.ai/settings/keys), or
  Jev through OpenRouter, Venice or OpenCode Zen, or your own server (below).

Nothing else: no Python, no other tool.

## Install

```text
/plugin install jev-mod --marketplace VictorGambarini/jev-mod
```

Installing asks for the mod's settings. **The key** is your TypeSafe key (or OpenRouter, Venice or
OpenCode Zen: pick which beside it). Claude Code keeps it in its own credential store, the
Keychain on macOS and `~/.claude/.credentials.json` (a 0600 file, beside your Claude login) on
Linux, and hands it only to the mod: it never enters the conversation, so Claude never sees it.
To set or change it later, open jev-mod in `/plugin`, or run this in your own terminal (not
through Claude):

```bash
read -rs KEY && printf '{"api_key":"%s"}' "$KEY" | claude plugin configure jev-mod@jev-mod --values-stdin; unset KEY
```

An empty value keeps the key already set; set it to `none` to stop using it.

Then check it with **`/jev-mod status`**: the backend, where its key came from (never the key), a live
check call, each feature's mode, and today's spend.

Nothing else is needed: no Python. A key already in the environment (`TYPESAFE_API_KEY`, ...) or
stored by jev-skills' `jev setup-key` is found too, and the mod reads jev-skills' switches,
`backends.json`, lane policy and `lanes.json` and shares its daily budget, so the two can run
side by side.

### Settings

**New installs start nearly empty (0.7.0).** Until `~/.config/jev-mod/config.json` exists, only `screening` and the `band` are on; every other feature is off. The band reads `nothing on yet · /jev-mod dashboard to choose` and one toast says the same at the start of each session. The first save from the dashboard or `/jev-mod` creates the file and both stop. A setting already in that file, or chosen in `/config` (*Routing* on, jev-skills' `hook_skills`), keeps winning as before.

Each feature has a mode (`on`, `off`, and `shadow` where it means something: decide and count,
change nothing) and, for some, settings of its own. In shadow the tool-call, completion and rules
gates, output trimming and the web filter run the decision in the background and only count its
outcome, so nothing waits for it; skills and screening ask in line, as they do in `on`.
`/jev-mod <feature> ...` sets them (above);
they live in a JSON file:

- `~/.config/jev-mod/config.json` for you (`$XDG_CONFIG_HOME` respected), and
- `.claude/jev-mod.json` in a project, which overrides it there. A project's file comes with the
  repository, so for the features that guard you (`screening`, `tool-gate`, `stop-gate`, `rules-gate`, `access-gate`) it may
  only make the mode stricter (off < shadow < on) than your own file, an older switch or the
  default give, and their settings come from your file alone. A looser mode or a setting there is
  passed over and shown by `/jev-mod` ("project config may not lower screening"), and
  `/jev-mod <feature> ... --project` and the dashboard refuse to write one. The `browser`, which
  acts for you on the web, is the other way round: a project's file may only turn it off, and its
  settings (`allowAttach` among them) come from your file alone.

```json
{"features": {"skills": {"mode": "shadow"}, "band": {"mode": "off"}}}
```

A change holds from the next event; no restart. `/jev-mod` shows each feature's mode, where
it came from, and anything in the files it passed over (an unknown feature, a mode a feature
does not have): a typo never turns a feature off.

What each feature did (and in shadow would have done) is counted by day for the last 30 days
in the mod's own store, for `/jev-mod dashboard`.

### The dashboard

`/jev-mod dashboard` opens a local page in your browser: every feature with an off / shadow / on
switch and its settings as inputs with their ranges, the last 14 days of activity, today's spend
and the backend. It needs `bun` or `node` on PATH (without them it writes a read-only copy of the
page). More: [src/features/dashboard/README.md](src/features/dashboard/README.md).

### Each feature's settings

Every setting has a default and a range; `/jev-mod <feature>` shows them. The detail, with what
each setting does, is in the feature's page.

| Feature | Modes | Default | Settings |
|---|---|---|---|
| [`routing`](src/features/routing/README.md) | on, off | off | none |
| [`skills`](src/features/skills/README.md) | on, shadow, off | off | none |
| [`screening`](src/features/screening/README.md) | on, shadow, off | on | none |
| [`tool-gate`](src/features/tool-gate/README.md) | on, shadow, off | off | `minConfidence`, `offMachineConfidence`, `scope`, `timeoutMs` |
| [`stop-gate`](src/features/stop-gate/README.md) | on, shadow, off | off | `maxNudges`, `minConfidence`, `evidenceChars` |
| [`rules-gate`](src/features/rules-gate/README.md) | on, shadow, off | off | `minConfidence`, `maxRules`, `timeoutMs`, `maxChangeChars`, `subagents` |
| [`access-gate`](src/features/access-gate/README.md) | on, shadow, off | off | `alwaysAllow` (your file only), `allowLocalhost` |
| [`trim-output`](src/features/trim-output/README.md) | on, shadow, off | off | `minLines`, `keepThreshold`, `localOnly` |
| [`web-filter`](src/features/web-filter/README.md) | on, shadow, off | off | `minConfidence`, `keepTop`, `fetchMinChars`, `timeoutMs` |
| [`find-files`](src/features/find-files/README.md) | on, off | off | `maxCandidates`, `limit`, `timeoutMs` (no shadow: the model calls it by choice) |
| [`review-triage`](src/features/review-triage/README.md) | on, off | off | `minConfidence`, `maxDiffChars`, `timeoutMs` (no shadow: the model calls it by choice) |
| [`browser`](src/features/browser/README.md) | on, off | off | `maxSteps`, `confirmConfidence`, `stepFloor`, `headed`, `allowAttach`, `textChars`; a project file may turn it off, never on, and sets none of these |
| [`band`](src/features/band/README.md) | on, off | on | none |

The five features that guard you (`screening`, `tool-gate`, `stop-gate`, `rules-gate`,
`access-gate`) are the ones a project's file may only make stricter.

The tool-call gate and the rules gate sit on Claude Code's permission decision (`tool.check`)
after its own verdict, and only ever tighten it. Try each in `shadow` first. The rules gate's 0.8
threshold has not been checked against real answers yet.

What wins, first to last: a kill file (`~/.config/jev-mod/OFF` for everything,
`~/.config/jev-mod/<FEATURE>_OFF` for one, or jev-skills' `HOOK_SKILLS_OFF` / `HOOK_SCREEN_OFF`
in `~/.config/jev`), then *jev-mod on* unticked in `/config`, then the project file (for
`screening`, `tool-gate`, `stop-gate`, `rules-gate` and `access-gate` only when it is stricter), then yours, then the older
switches (the `/config` fields below, then jev-skills' `jev switches`), then the
default.

`/config` keeps what has to live there: the keys, the provider, *jev-mod on* (untick it to turn
everything off), and *Private* (send nothing: no routing or suggestions; fetched text is
screened locally only; long output is folded locally only). Its *Routing*, *Skill suggestions*, *Screening* and *jev-mod band* fields
still work when the files do not set that feature, and will go in a later release.

## Decision backends

Jev answers through TypeSafe, OpenRouter, Venice or OpenCode Zen. Any other server that answers
the same `/v1/systemone` protocol (a self-hosted decision model, a gateway) can be named in
`~/.config/jev/backends.json` and made the default:

```json
{"default": "lais05",
 "backends": {"lais05": {"protocol": "systemone", "url": "https://lais05.example/v1/systemone", "model": "Cloudflare/clef-flash"}}}
```

Its key goes in the *named backend key* setting, which is used only for the backend the file
names as `"default"`: a backend picked with `JEV_BACKEND`, or any other, reads its own key
(`JEV_BACKEND_<NAME>_API_KEY` or its `key_env`, then what `jev setup-key --backend` stored), so
the setting's key never goes to another backend's URL. Every threshold was measured on Jev; another
model's confidences are not the same numbers, so a backend can carry its own `tuning` and its
own copy of a policy (`~/.config/jev/backends/<name>/policies/`). The mod reads
`skillpick.need_threshold`, `skillpick.match_threshold`, `skillpick.shortlist_floor` and
`webscreen.injection_threshold`; the browser takes `choose.min_confidence` as its step floor and
`choose.dead_repeats` as how often a step may change nothing before it is dropped, each only when
the backend sets it (over the `stepFloor` knob and 2; `choose.min_confidence` is bounded to
0.5-0.99 as in jev-skills, so it can raise the floor, not lower it). `search.sufficiency_threshold` is accepted,
since jev-skills' search reads it from the same file, but nothing in the mod uses it.

A named backend is read in Jev's units, whatever server it is:

- **Confidence.** Servers compute `confidence` differently (Laya: 1 − normalised entropy; Kev:
  (p_max − 1/K)/(1 − 1/K), which is Jev's). The mod computes a choice's or a score's confidence
  from the probabilities the backend returned with Jev's formula, (n·p_max − 1)/(n − 1), or takes
  `x_jev_confidence` when the server sends it (Laya 0.4.2+). Yes/no answers are probabilities and
  are read as they come. Answers from TypeSafe, OpenRouter, Venice and Zen keep Jev's own number.
- **Pinned yes/no answers.** Once a backend has given 20 yes/no answers this session (of its last
  50), yeses and noes both, and not one strictly between 0.2 and 0.8, `/jev-mod status` and the
  band warn: a server that clamps its calibration (Von's default) makes every 0.8 gate fire on
  every yes. Start Von with `--noul-decision raw`.
- **Cut or refused input is not judged.** A reply that says the server read only part of the
  state (`truncated` or `truncation` in it, or an `X-Von-Truncated` header), a 422 that says the
  input is too long, and a state longer than the backend's `max_input_chars` (not sent at all)
  all count as no answer: every feature fails open, and nothing cools off.
- **Loading is not an outage.** A 503 or a refused connection before the backend first answers
  this session (its first three calls), or a 503 with `Retry-After` at any time, pauses the mod
  for ten seconds, or the `Retry-After` up to thirty, instead of five minutes. `first_timeout_ms`
  gives the calls before its first answer a longer timeout, for a server that loads its model
  then. Any other failure cools off as for the providers.

## Run a decision model on your own machine

A server on this machine needs no key: a backend with none gets no `Authorization` header, and
plain `http` is allowed on `localhost`, `127.0.0.1` and `::1`. `/jev-mod status` marks it
`(local)` and names the backend and model that answered its check. Put one of these in
`~/.config/jev/backends.json`:

```json
{"default": "ollaya",
 "backends": {
   "ollaya": {"url": "http://localhost:11435/v1/systemone", "model": "laya",
              "max_input_chars": 1800, "first_timeout_ms": 60000},
   "laya": {"url": "http://127.0.0.1:8000/v1/systemone", "model": "laya",
            "max_input_chars": 1800, "first_timeout_ms": 60000},
   "von": {"url": "http://127.0.0.1:8080/v1/systemone", "model": "von",
           "first_timeout_ms": 60000}}}
```

`ollaya` is Ollaya's default port; `laya` is `laya-serve`; `von` is Von, started with
`--noul-decision raw` so its yes/no answers are not clamped. The ports for `laya-serve` and Von are
examples: use the ones your server prints, and the model id it serves. Laya reads only 512
tokens, about 2,000 characters of English and fewer of code or JSON; `max_input_chars` 1800
leaves room for the questions, so a longer state is not sent rather than judged on its first
part. Most features send more than that, so with Laya they fail open more often than they decide.

The thresholds were measured on Jev. A local model's answers, even in Jev's units, are not Jev's:
set the backend's own `tuning` (above) from what it answers on your work, and keep the gates in
`shadow` until you have. Every feature still asks the one default backend; sending cheap
questions to a local model and risky gates to Jev is not supported.

## Environment variables

Read when a hook runs, so set them where Claude Code starts. Each one is optional.

| Variable | What it does |
|---|---|
| `JEV_BACKEND` | Picks a backend from `backends.json` by name over the file's `"default"`; `default`, `none` or a provider's name uses the built-in providers. |
| `JEV_BACKENDS` | Where `backends.json` is (`~` allowed), instead of `~/.config/jev/backends.json`. |
| `JEV_PROVIDER` | Picks the provider (`typesafe`, `openrouter`, `venice`, `zen`) when this machine has a key for it, over TypeSafe first. |
| `JEV_MODEL` | The model id sent to a named backend, over the one in its `backends.json` entry. |
| `TYPESAFE_MODEL` | The model id sent to a built-in provider, over the provider's default. |
| `TYPESAFE_BASE_URL` | Sends decisions to a compatible server at `<url>/v1/systemone` instead of a provider or a named backend; it gets no provider key, only `JEV_PROXY_API_KEY`. The official `https://api.typesafe.ai` counts as unset. |
| `JEV_PROXY_API_KEY` | The key sent to the `TYPESAFE_BASE_URL` server, and nowhere else. |
| `JEV_LIMITS` | `off` (or `0`, `false`, `no`) turns off the daily budget and per-minute brake shared with jev-skills (`limits.json`). |
| `JEV_HOME` | Where the mod reads jev's `routing.json` and `limits.json` (and keeps the budget's count), instead of `~/.config/jev`; keys and `backends.json` are still read from `~/.config/jev`. |
| `JEV_MOD_DASHBOARD` | For testing, comma-separated: `no-browser` opens nothing, `static` writes the read-only page even when bun or node is there. |

## What it looks like

Above the prompt, after the first turn:

```text
🧭 easy → haiku 4.5  $0.0043 (112)  🛡 withheld 2  🔌 jev-1.13 · typesafe
```

The lane reads as difficulty (easy, normal, hard, critical), then the model and effort the mod
switched to, or "kept" when it changed nothing. Turn it off with `"band": {"mode": "off"}` in your config file.

`statusline/statusline.py` is an optional status line for the rest (model, folder, branch,
context, cache countdown, spend, rate limits): `"statusLine": {"type": "command", "command":
"<path>/statusline/statusline.py", "refreshInterval": 60}` in `~/.claude/settings.json`.

## Develop

```bash
claude plugin validate .        # what the mod hooks and reaches, and anything the engine would refuse
claude plugin test .            # the kit tests (*.test.ts beside the code)
claude --plugin-dir .           # a session with this checkout loaded
```

How it is put together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Adding a feature:
[docs/ADDING-A-FEATURE.md](docs/ADDING-A-FEATURE.md).

## License

MIT. Derived from Hermes Jev Skills; see [NOTICE](NOTICE).
