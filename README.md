# jev-mod

**A Claude Code mod that hands the small decisions to a cheap decision model.**

Your agent spends frontier-model time on things that are not thinking: which model should
answer this turn, which of your skills applies, which parts of a long session still matter,
whether a fetched page is trying to give it orders. Those are decisions, not prose. jev-mod
asks a decision model (Jev, or any backend you run) and lets Claude do the work.

It runs inside Claude Code as a mod: hooks that reach the engine where settings hooks cannot.

| Feature | When | What it decides |
|---|---|---|
| **Routing** | each turn | The turn's lane (small / medium / high / escalate) sets its effort, and its model while the context is small. Follow-ups step down one lane at most; corrections hold or raise it; above 40k tokens the model only moves up. |
| **Skills** | each prompt | The one installed skill the prompt needs, if any, added as context beside it. Only skills the session itself lists can be suggested, and each at most once a session. |
| **Screening** | after WebFetch, WebSearch, every MCP tool, and Bash commands that fetch (`curl`, `wget`, `gh api`, ...) | Sentences carrying instructions aimed at an AI are withheld before Claude reads them; the rest of the result is kept. |
| **Tool-call gate** (shadow by default) | before a consequential tool call Claude Code would allow: Bash that pushes, deletes, rewrites history, publishes, installs, deploys, migrates or writes outside the project; Write/Edit outside the project; MCP tools that send, create, change or delete | Whether you asked for it, whether it breaks a limit you stated ("don't push"), and whether it is hard to undo. A doubtful call is put to you in the permission dialog with the reason, instead of running unasked. It only tightens Claude Code's decision, never loosens it. |
| **Completion gate** (`stop-gate`, shadow by default) | when the main agent ends a turn claiming the work is done or checks pass | Whether the turn's evidence (edited files, the commands it ran and the tail of their output) shows each claim. In `on`, an unshown claim sends the agent back once more, naming it and asking it to verify or say plainly what is unverified, never to take a hard-to-undo step; at most twice per prompt. |
| **Output trimming** | after a Bash command prints 200 lines or more (shadow by default) | Runs of repeated and near-identical lines are folded locally; then each remaining chunk the current goal (your latest request and the command) no longer needs is replaced by a marker naming its lines. Errors, warnings, failures, stack traces, summaries and the first and last lines always stay. The full output is kept in `~/.cache/jev-mod/outputs/` (the last 50), and the trimmed output's first line names the file. Bash output that screening looked at is trimmed after screening, so only screened text reaches the model. |
| **The jev-mod band** | always | One line above the prompt: what jev-mod decided this turn, its cost this session, what screening withheld, and which backend answered (red, with the reason, while it is failing). |
| **`/jev-mod compact`** | when you type it | A compaction with no summary: only the turns the decision model marks *keep* stay, plus the last few. `/compact` is left as Claude Code has it. |

One command manages the mod; the typeahead offers each word after it:

| Command | What it does |
|---|---|
| `/jev-mod` (or `/jev-mod list`) | Every feature: its mode and where that came from, its settings, then anything in the config files that was passed over. |
| `/jev-mod status` | The backend, where its key came from (never the key), a live check, each feature's mode, today's spend. |
| `/jev-mod compact` | The compaction above. |
| `/jev-mod dashboard` | A page in your browser to see and set every feature (below); `/jev-mod dashboard stop` ends it. |
| `/jev-mod <feature>` | Its help, its modes, and each setting with its range, default and value now. |
| `/jev-mod <feature> on\|off\|shadow` | Sets its mode in your config file (`--project`: the project's). |
| `/jev-mod <feature> <setting> <value>` | Sets one of its settings. |
| `/jev-mod <feature> reset` | Clears what the file sets for it. |

After a change it shows the value that now holds, and warns when a kill file, `/config` or the
project file still overrides what was just written.

Every decision fails open: no answer means the turn runs exactly as plain Claude Code. After a
failed call the mod stops asking for five minutes, so a backend that is down costs one timeout.

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

Each feature has a mode (`on`, `off`, and `shadow` where it means something: decide and count,
change nothing) and, for some, settings of its own. `/jev-mod <feature> ...` sets them (above);
they live in a JSON file:

- `~/.config/jev-mod/config.json` for you (`$XDG_CONFIG_HOME` respected), and
- `.claude/jev-mod.json` in a project, which overrides it there.

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
switch, its settings as inputs with their ranges, a `?` for its help, and where each value comes
from (default, user, project, a kill file, `/config`), with a note when a higher layer overrides
what you edit. A *User / This project* switch picks which file an edit goes to. Its other tabs are
the last 14 days of activity (what each feature did, and in shadow would have done), today's spend
against the daily budget, and the backend with where its key came from (never the key).

It needs `bun` or `node` on PATH: the mod starts a small server bound to 127.0.0.1 on a free port,
reachable only with the one-time link it prints, and only while the session is open. The server
writes nothing: each change goes back to the mod, which checks it as `/jev-mod` would and writes
the config file. Without bun or node it writes a read-only copy of the page instead
(`~/.config/jev-mod/dashboard/<session>/dashboard.html`) and opens that.

| Feature | Modes | Default | |
|---|---|---|---|
| `routing` | on, off | on | each turn's model and effort from the decision model's lane |
| `skills` | on, shadow, off | on | suggests the installed skill that matches a prompt |
| `screening` | on, shadow, off | on | withholds instructions aimed at the model in fetched text |
| `tool-gate` | on, shadow, off | shadow | asks you before a consequential tool call the decision model doubts; settings `minConfidence` (0.7), `scope` (`bash`, `bash+edits`, `all-risky`), `timeoutMs` (2000) |
| `trim-output` | on, shadow, off | shadow | cuts long Bash output down to what the current goal needs; `minLines` (200), `keepThreshold` (0.35), `localOnly` (false) |
| `band` | on, off | on | the line above the prompt |
| `stop-gate` | on, shadow, off | shadow | checks a turn's "done" against its evidence; `maxNudges` (0-5, 2) per prompt, `minConfidence` (0-1, 0.7) to send it back, `evidenceChars` (1000-20000, 6000) sent with each check |

**The tool-call gate** sits on Claude Code's permission decision (`tool.check`) after its own
verdict. A call your rules refuse, or already ask you about, is left alone; one they would allow
and the gate doubts becomes an ask, never a deny. Only consequential calls are sent (reads,
builds, tests and edits inside the project never are), with your last few prompts (redacted) and
any limits you stated; a call carrying a secret is not sent. Subagents' calls are gated too: a
subagent is where text fetched from elsewhere most often steers a call. No answer within
`timeoutMs`, private mode, the daily budget or a backend cool-off: the call goes on as Claude
Code decided. In `bypassPermissions`, `auto` and `dontAsk` modes, and in `claude -p`, the mode
settles the ask (headless, it is refused with the gate's reason). Try it in `shadow` first: it
counts `would-ask`, `passed` and `skipped`; `on` counts `asked-person`.

What wins, first to last: a kill file (`~/.config/jev-mod/OFF` for everything,
`~/.config/jev-mod/<FEATURE>_OFF` for one, or jev-skills' `HOOK_SKILLS_OFF` / `HOOK_SCREEN_OFF`
in `~/.config/jev`), then *jev-mod on* unticked in `/config`, then the project file, then yours,
then the older switches (the `/config` fields below, then jev-skills' `jev switches`), then the
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

Its key goes in the *named backend key* setting. Every threshold was measured on Jev; another
model's confidences are not the same numbers, so a backend can carry its own `tuning` and its
own copy of a policy (`~/.config/jev/backends/<name>/policies/`).

## What it looks like

Above the prompt, after the first turn:

```text
🧭 easy → haiku 4.5 · low  $0.0043 (112)  🛡 withheld 2  🔌 jev-1.13 · typesafe
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
