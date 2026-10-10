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
| **Tool-call gate** (off by default) | before a consequential tool call Claude Code would allow: Bash that pushes, deletes, rewrites history, publishes, installs, deploys, migrates or writes outside the project; Write/Edit outside the project; MCP tools that send, create, change or delete | Whether you asked for it, whether it breaks a limit you stated ("don't push"), and whether it is hard to undo. A doubtful call is put to you in the permission dialog with the reason, instead of running unasked. It only tightens Claude Code's decision, never loosens it. |
| **Completion gate** (`stop-gate`, off by default) | when the main agent ends a turn claiming the work is done or checks pass | Whether the turn's evidence (edited files, the commands it ran and the tail of their output) shows each claim. In `on`, an unshown claim sends the agent back once more, naming it and asking it to verify or say plainly what is unverified, never to take a hard-to-undo step; at most twice per prompt. |
| **Rules gate** (`rules-gate`, off by default) | before Write, Edit, MultiEdit or NotebookEdit changes a file inside the project | Whether the change breaks one of the project's written rules that apply to that file: list items and short directives in `CLAUDE.md`, `AGENTS.md` and `CLAUDE.local.md` from the root down to the file's folder, and `.claude/rules/*.md` whose `paths:` match it (one yes/no question per rule, at most 25). In `on`, a rule judged broken with confidence 0.8 or more refuses the edit, and the agent is told which rule, quoted with its file, and asked to fix the change or tell you why the rule should not apply. Edits outside the project are the tool-call gate's. |
| **Access gate** (`access-gate`, off by default) | before a Bash command, a Read/Grep/Write/Edit, or an MCP tool whose name says ssh, rdp, vnc, remote, shell, exec, kubectl or k8s | Whether the call logs in to or opens a way into another machine, by category: `ssh` (scp, sftp, mosh, rsync to a host, never git), `remote-desktop`, `cloud-shell` (aws ssm, gcloud compute ssh, kubectl exec, ...), `fleet` (ansible, pssh, ...), `tunnels` (ssh -L/-R/-D, ngrok, cloudflared, ...), `remote-db` (psql, mysql, ... to a host other than this one), `legacy` (telnet, ftp, smbclient, ...), `scanning` (nmap, ...), and `keys` (reading private keys and credential stores, writing `~/.ssh/authorized_keys` or `~/.ssh/config`). Read locally, behind sudo, `bash -c`, eval and pipes; no decision model. In `on`, a category this session has not allowed is refused, and the model is told to ask you to run it or to allow it: `/jev-mod access ssh on` (for this session only; `on <host>` for one host). The band shows what is open (`🔓 ssh`). A guardrail against the model's habits, not a sandbox: [docs/ACCESS.md](docs/ACCESS.md). |
| **Output trimming** | after a Bash command prints 200 lines or more (off by default) | Runs of repeated and near-identical lines are folded locally; then each remaining chunk the current goal (your latest request and the command) no longer needs is replaced by a marker naming its lines. Errors, warnings, failures, stack traces, summaries and the first and last lines always stay. The full output is kept in `~/.cache/jev-mod/outputs/` (the last 50), and the trimmed output's first line names the file. Bash output that screening looked at is trimmed after screening, so only screened text reaches the model: a large output Claude Code kept in a file is screened whole before any of it is inlined, and left as Claude Code's preview when it cannot be. A failed command's trimmed output still reaches the model as an error. |
| **Find files** (`find-files`) | when the model calls `find_files` (offered while it is on) | Which files implement what the model describes in plain words ("where retries with backoff are done"). The project's files (git's list, so `.gitignore` is honoured) are scored locally by the query's words in each path, its first lines and how many lines mention them; the best 60 go to the decision model as short redacted cards (path, header comment, the names it defines, a few matching lines) and it judges each *implements*, *related* or *unrelated*. The model gets a ranked list of paths with a reason each, in place of a chain of greps. No key, private mode, the daily budget or a failing backend: the local ranking, labelled as such. |
| **Review triage** (`review-triage`, off by default) | when the model calls `review_triage` before a code review (offered while it is on) | How deep the first review pass should go. The git diff (uncommitted changes against HEAD, else the last commit, or the changes since a `base` the model names) goes to the decision model redacted and cut to 12,000 characters, with seven yes/no questions: security-sensitive code, hard-to-undo data changes, a public interface others rely on, runtime-only failures, a rule in the project's CLAUDE.md or AGENTS.md, behaviour changed without a test, and work beyond the stated intent. *quick* (one review pass is enough) only when every answer is a confident no; otherwise *full*, naming the questions and the files behind them (one more request asks which files). It never replaces the review. A hunk that looks like it holds or handles a secret is not sent and makes it *full*; so do no key, private mode, the daily budget, a failing backend or a diff too large to triage. |
| **Browser** (`browser`, off by default) | when the model calls `browse` (offered while it is on) | Drives a web page toward a goal the model states as an end state. A headless Chromium on a throwaway profile (Playwright, installed once with `/jev-mod browser install`) opens the page; each step its links, buttons and fields become a table of actions and the decision model picks one. It never writes text: what to type comes from the call's `inputs`, sent to it by name only. Page text is redacted and screened first. It stays on the start site; a consequential step (buy, pay, send, delete, post, sign up, submit a form) waits for you unless the goal names it and the decision model is sure the goal asks for it; *done* needs a second check over the page's own text. Details and the safety rules: [docs/BROWSER.md](docs/BROWSER.md). |
| **The jev-mod band** | always | One line above the prompt: what jev-mod decided this turn, its cost this session, what screening withheld, and which backend answered (red, with the reason, while it is failing). |
| **`/jev-mod compact`** | when you type it | A compaction with no summary. The decision model is asked *keep* or *drop* for each message's text and for each tool call together with its result (it sees the tool, its main argument such as the command or file path, and the result's start and end, redacted and cut to under 700 characters, saying how much is not shown); a call and its result always share one fate. A message goes only when every part of it was judged drop with confidence of at least 0.7. Everything else stays: low-confidence drops, anything it did not judge (it was down, timed out, answered only part, or the text, call or result held something sensitive that is never sent), the last six messages, and both halves of any kept tool call. Background whose gist later work needs counts as keep. Nothing is summarised. `/compact` is left as Claude Code has it. |

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
| `/jev-mod access` | The access gate: each category, blocked or allowed this session. `/jev-mod access <category> on [host]` allows one for this session (only typed by you at the prompt), `off` blocks it again, `/jev-mod access all off` closes them all. |
| `/jev-mod browser install` | Installs Playwright (a pinned version) and its Chromium into `~/.cache/jev-mod/browser/` for the `browse` tool; about 150 MB, needs `npm`. Only ever run when you ask. |

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

**New installs start nearly empty (0.7.0).** Until `~/.config/jev-mod/config.json` exists, only `screening` and the `band` are on; every other feature is off. The band reads `nothing on yet · /jev-mod dashboard to choose` and one toast says the same at the start of each session. The first save from the dashboard or `/jev-mod` creates the file and both stop. A setting already in that file, or chosen in `/config` (*Routing* on, jev-skills' `hook_skills`), keeps winning as before.

Each feature has a mode (`on`, `off`, and `shadow` where it means something: decide and count,
change nothing) and, for some, settings of its own. Shadow never adds latency: the decision runs
in the background and only its outcome is counted, so nothing waits for it. `/jev-mod <feature> ...` sets them (above);
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
switch, its settings as inputs with their ranges, a `?` for its help, and where each value comes
from (default, user, project, a kill file, `/config`), with a note when a higher layer overrides
what you edit. A *User / This project* switch picks which file an edit goes to. In *This project*, a guarding feature's
looser modes and its settings cannot be chosen (above). Its other tabs are
the last 14 days of activity (what each feature did, and in shadow would have done), today's spend
against the daily budget, and the backend with where its key came from (never the key).

It needs `bun` or `node` on PATH: the mod starts a small server bound to 127.0.0.1 on a free port,
reachable only with the one-time link it prints, and only while the session is open. The server
writes nothing: each change goes back to the mod, which checks it as `/jev-mod` would and writes
the config file. Without bun or node it writes a read-only copy of the page instead
(`~/.config/jev-mod/dashboard/<session>/dashboard.html`) and opens that.

| Feature | Modes | Default | |
|---|---|---|---|
| `routing` | on, off | off | each turn's model and effort from the decision model's lane |
| `skills` | on, shadow, off | off | suggests the installed skill that matches a prompt |
| `screening` | on, shadow, off | on | withholds instructions aimed at the model in fetched text |
| `tool-gate` | on, shadow, off | off | asks you before a consequential tool call the decision model doubts; settings `minConfidence` (0.7), `scope` (`bash`, `bash+edits`, `all-risky`), `timeoutMs` (2000) |
| `rules-gate` | on, shadow, off | off | refuses an edit inside the project that breaks a written project rule; `minConfidence` (0.5-1, 0.8) to refuse, `maxRules` (5-60, 25) judged per edit, `timeoutMs` (1000-10000, 3000), `maxChangeChars` (1000-20000, 6000) of the change sent, `subagents` (true) |
| `access-gate` | on, shadow, off | off | refuses ssh, remote desktops, cloud shells, fleets, tunnels, remote databases, telnet and kin, scans and key reads this session has not allowed; `alwaysAllow` (categories open in every session, comma-separated; your file only), `allowLocalhost` (true) |
| `trim-output` | on, shadow, off | off | cuts long Bash output down to what the current goal needs; `minLines` (200), `keepThreshold` (0.35), `localOnly` (false) |
| `find-files` | on, off | off | the `find_files` tool the model calls to find the files that implement something; `maxCandidates` (10-200, 60) judged per query, `limit` (1-50, 10) returned, `timeoutMs` (1000-30000, 8000) before the local ranking answers. No shadow: the model calls it by choice |
| `review-triage` | on, off | off | the `review_triage` tool the model calls before a code review; `minConfidence` (0.5-1, 0.8) of each *no* for *quick*, `maxDiffChars` (2000-40000, 12000) of the diff sent (over ten times that: *full*, nothing sent), `timeoutMs` (1000-30000, 8000) before it answers *full*. No shadow: the model calls it by choice |
| `browser` | on, off | off | the `browse` tool; `maxSteps` (5-60, 20) per call, `confirmConfidence` (0.5-1, 0.85) to take a consequential step or accept *done*, `stepFloor` (0.3-0.95, 0.4) below which it stops as blocked, `headed` (false), `allowAttach` (false: let a call drive your own Chrome), `textChars` (1000-20000, 6000) of page text per step. A project file may turn it off, never on, and sets none of these |
| `band` | on, off | on | the line above the prompt |
| `stop-gate` | on, shadow, off | off | checks a turn's "done" against its evidence; `maxNudges` (0-5, 2) per prompt, `minConfidence` (0-1, 0.7) to send it back, `evidenceChars` (1000-20000, 6000) sent with each check |

**The tool-call gate** sits on Claude Code's permission decision (`tool.check`) after its own
verdict. A call your rules refuse, or already ask you about, is left alone; one they would allow
and the gate doubts becomes an ask, never a deny. Only consequential calls are sent (reads,
builds, tests and edits inside the project never are), with your last few prompts (redacted) and
any limits you stated. A call carrying a secret is never sent; in `on` it is put to you instead,
with the reason that it was not judged, so check it yourself (`asked-secret`; shadow counts
`would-ask-secret`). Subagents' calls are gated too: a
subagent is where text fetched from elsewhere most often steers a call. No answer within
`timeoutMs`, private mode, the daily budget or a backend cool-off: the call goes on as Claude
Code decided. In `bypassPermissions`, `auto` and `dontAsk` modes, and in `claude -p`, the mode
settles the ask (headless, it is refused with the gate's reason). Try it in `shadow` first: it
counts `would-ask`, `passed` and `skipped`, in the background, so no call waits for it; `on`
counts `asked-person`.

**The rules gate** sits on the same permission decision, for Write, Edit, MultiEdit and
NotebookEdit on files inside the project. A deny already made stands; an edit Claude Code would
allow or ask you about may be refused, and the refusal is the error the model reads. What is sent:
the file's path in the project, the change (an Edit's old and new text, a MultiEdit's every edit, a
Write's changed lines against the file, or the whole of a new file; redacted, about
`maxChangeChars`), and one question per rule. A rule is a list item, a numbered item, or a short
line that reads as a directive; headings (kept as each rule's context), code blocks, tables and
long prose are not rules. Past `maxRules`, the rules whose words match the file's path and the
change's identifiers are kept, nearer files first. A change or a rule that only mentions a
secret ("Never log API keys", `apiKey: config.apiKey`) is judged like any other; secret values in
either (the literal after `password =` or `apiKey:`, a token, a bearer credential, a private key)
are masked before anything is sent. A rule about other files or workflow steps (tests, a
changelog, commits, reviews) is judged not broken by a single edit. No answer within `timeoutMs`,
no key, private mode, the daily budget or a backend cool-off: the edit goes on. Parsed rule files are cached by mtime. The 0.8 threshold has
not been checked against real answers yet: run it in `shadow` first (it counts `would-block`,
`passed` and `skipped`, in the background, so no edit waits for it); `on` counts `blocked`.
A rule file it reads, for example `.claude/rules/tests.md`:

```markdown
---
paths:
  - "**/*.test.ts"
---
# Tests

- Never touch the real `~/.config/jev-mod/config.json`; use a fake IO.
- Use a fake backend; no test needs a real key.
- Name each test after the behaviour it checks.
```

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
