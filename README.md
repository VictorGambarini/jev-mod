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
| **Skills** | each prompt | The one installed skill the prompt needs, if any, added as context beside it. |
| **Screening** | after WebFetch, WebSearch, every MCP tool, and Bash commands that fetch (`curl`, `wget`, `gh api`, ...) | Sentences carrying instructions aimed at an AI are withheld before Claude reads them; the rest of the result is kept. |
| **`/compact-jev`** | when you type it | A compaction with no summary: only the turns the decision model marks *keep* stay, plus the last few. `/compact` is left as Claude Code has it. |

Every decision fails open: no answer means the turn runs exactly as plain Claude Code. After a
failed call the mod stops asking for five minutes, so a backend that is down costs one timeout.

## Install

```text
/plugin install jev-mod --marketplace VictorGambarini/jev-mod
```

**For now it also needs the `jev` command** from [hermes-jev-skills](https://github.com/kerpopule/hermes-jev-skills)
on your PATH, with a decision backend connected (`jev doctor`). The engine is being ported into
the mod in TypeScript ([docs/PORTING.md](docs/PORTING.md)); once it is, jev-mod needs nothing
else.

## Decision backends

| Backend | Protocol |
|---|---|
| Jev via TypeSafe, OpenRouter, Venice or OpenCode Zen | `systemone` |
| Your own OpenAI-compatible server (vLLM, Ollama, ...) | `openai`, with logprobs *(with the engine port)* |

Every threshold was measured on Jev. Another model's confidences are not the same numbers, so
each backend can carry its own tuning.

## Status line

`statusline/statusline.py` draws the session on line one and what jev decided on line two:

```text
jev-mod  main*  │  Opus 5.5  │  ━━━━━━─── 84k/200k 25%  │  $1.23 · 1h05 · +120 −30  │  5h 23% · 7d 41%
jev  small · haiku 4.5 · low  │  skill release-notes  │  withheld 2  │  jev via openrouter
```

`"statusLine": {"type": "command", "command": "<path>/statusline/statusline.py"}` in
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
