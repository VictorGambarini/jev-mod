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
| **`/compact-jev`** | when you type it | A compaction with no summary: only the turns the decision model marks *keep* stay, plus the last few. `/compact` is left as Claude Code has it. |

Every decision fails open: no answer means the turn runs exactly as plain Claude Code. After a
failed call the mod stops asking for five minutes, so a backend that is down costs one timeout.

## Install

```text
/plugin install jev-mod --marketplace VictorGambarini/jev-mod
```

Installing asks for the mod's settings. **The key** is your TypeSafe key (or OpenRouter, Venice or
OpenCode Zen: pick which beside it). Claude Code keeps it in your OS's secure storage and hands
it only to the mod; it never enters the conversation, so Claude never sees it. To set or change
it later, open jev-mod in `/plugin`, or run this in your own terminal (not through Claude):

```bash
read -rs KEY && printf '{"api_key":"%s"}' "$KEY" | claude plugin configure jev-mod --values-stdin; unset KEY
```

Then check it with **`/jev-status`**: the backend, where its key came from (never the key), a live
check call, the switches, and today's spend.

Nothing else is needed: no Python. A key already in the environment (`TYPESAFE_API_KEY`, ...) or
stored by jev-skills' `jev setup-key` is found too, and the mod reads jev-skills' switches,
`backends.json`, lane policy and `lanes.json` and shares its daily budget, so the two can run
side by side.

### Settings

`/config` lists the rest, under jev-mod:

| Setting | Default | |
|---|---|---|
| Routing | on | each turn's model and effort from the decision model's lane |
| Skill suggestions | default | `on`, `shadow` (ask and count, suggest nothing), `off`; `default` follows `jev switches`, else on |
| Screening | default | the same, for withholding injected text |
| Private | off | send nothing: no routing or suggestions; fetched text is screened locally only |

A `HOOK_SKILLS_OFF` or `HOOK_SCREEN_OFF` file in `~/.config/jev` still turns that feature off
whatever the setting says.

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

## Status line

`statusline/statusline.py` draws three short lines: where you are, what the session has used, and
what jev decided this turn. The bar is context used (green, yellow from 70%, red from 90%); 🔥
counts down the prompt cache's time to live. On line three the lane reads as difficulty (easy,
normal, hard, critical), followed by the model and effort the mod switched to, or "kept" when it
changed nothing; then jev's cost and calls this session, 🛡 only when injected text was withheld,
and the decision model and backend, red with the reason while jev is failing. Without the mod in
the session line three is hidden:

```text
[Opus 5.5 · medium] 📁 jev-mod | 🌿 main* | +120/-30
██░░░░░░░░ 25% · 84k/200k | 🔥 1h · 42m left · hit 99% | $1.23 | ⏱️ 1h 5m | 5h 23% · 7d 41%
🧭 easy → haiku 4.5 · low | $0.0043 (112) | 🛡 withheld 2 | 🔌 jev-1.13 · openrouter
```

`"statusLine": {"type": "command", "command": "<path>/statusline/statusline.py", "refreshInterval": 60}` in
`~/.claude/settings.json`. A row the mod draws itself is planned.

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
