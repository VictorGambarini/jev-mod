# Tool-call gate

Asks you before a consequential tool call the decision model doubts.

Modes: `on`, `shadow`, `off`. Default: `off`. It guards you, so a project's file may only make its mode stricter, and its settings come from your file alone.

## What it decides

Whether a consequential call should be put to you in the permission dialog, with the reason, instead of running unasked. It never loosens Claude Code's own decision: a call your rules refuse, or already ask you about, is left alone; one they would allow and the gate doubts becomes an ask, never a deny.

## When it runs

Before a consequential tool call Claude Code would allow (it sits on `tool.check`, after Claude Code's own verdict):

- Bash that pushes, deletes, rewrites history, publishes, installs, deploys, migrates or writes outside the project;
- Write/Edit outside the project;
- MCP tools that send, create, change or delete.

Reads, builds, tests and edits inside the project are never sent. Subagents' calls are gated too: a subagent is where text fetched from elsewhere most often steers a call.

## How it decides

The decision model gets the call and your last few prompts (4, redacted) with any limits you stated (up to 8: "don't push", "only ...", "ask me first", ...), and answers up to four yes/no questions:

1. Did you ask for this action, or does it clearly follow from what you asked?
2. Is it hard to undo, or does it reach beyond this machine?
3. Does it send data off this machine (an upload, a post to a URL, an email or message, a push to a remote, pasting into an outside service)?
4. Does it break a limit you stated? (Asked only when you stated one.)

The call is put to you when:

- it breaks a stated limit, and the model is at least `minConfidence` sure; or
- it sends data off this machine, the model is at least `offMachineConfidence` sure it does, and not at least `minConfidence` sure you asked for it; or
- it is hard to undo (0.5 or more) and the model is not at least `minConfidence` sure you asked for it.

The model says a limit is broken, not which one, so the reason lists every limit you stated.

**Reuse.** An identical call (same session, tool and input, and nothing new asked or stated since) judged in the last 2 minutes reuses that judgement without a request, and two in flight share one; they count `reused`. The cache keys on a hash of the redacted input, holds only the answers, keeps at most 200, and never keeps a call nothing answered for.

**Read-only MCP tools.** An MCP tool flagged only by its name, whose server declares it read-only, is not judged (`skipped`). Claude Code shows that declaration (`readOnlyHint`, as `isReadOnly`) only on a call's result, so the first call of each tool in a session is judged, and a later result without it takes it back; a hook sees no `destructiveHint` or `openWorldHint`. The declaration settles only names whose flagged words are often nouns or reads (`get_block`, `list_by_label`, `resolve_library_id`, `execute_query`); a name that sends, creates, changes or deletes is judged whatever its server says.

**Permission modes.** In `bypassPermissions`, `auto` and `dontAsk` modes, and in `claude -p`, the mode settles the ask (headless, it is refused with the gate's reason).

**Shadow.** Try it in `shadow` first: it counts `would-ask`, `passed` and `skipped`, in the background, so no call waits for it. `on` counts `asked-person`.

## Settings

| Setting | Default | Range | What it does |
|---|---|---|---|
| `minConfidence` | 0.8 | 0-1 | One bar used two ways. A hard-to-undo call runs unasked only if the model is at least this sure you asked for it, so higher asks more often there. A call is put to you for breaking a limit you stated only if the model is at least this sure it does, so higher asks less often there. |
| `offMachineConfidence` | 0.7 | 0-1 | A call is put to you for sending data off this machine only if the model is at least this sure it does, and not at least `minConfidence` sure you asked for it. Higher asks less often. |
| `scope` | `all-risky` | `bash`, `bash+edits`, `all-risky` | `bash`: consequential Bash commands only. `bash+edits`: also Write/Edit outside the project. `all-risky`: also MCP tools whose names send, create, change or delete. |
| `timeoutMs` | 2000 | 500-5000 | How long a call waits for the decision before it goes on as Claude Code decided. |

## Failing open, privacy and budget

No answer within `timeoutMs`, private mode, the daily budget or a backend cool-off: the call goes on as Claude Code decided.

A call carrying a secret is never sent. In `on` it is put to you instead, with the reason that it was not judged, so check it yourself (`asked-secret`; shadow counts `would-ask-secret`). A credential riding on a push or a POST is exactly what the gate is for. Everything that is sent is redacted.

## Limits

- It only tightens; it cannot allow what Claude Code refuses.
- A hook sees no `destructiveHint` or `openWorldHint`, and the read-only declaration only after the tool's first result.
- The patterns that find a consequential Bash command read the command line (also behind `sudo`, `env`, `bash -c` and the like); a script that does the work out of sight is not seen. This is not a sandbox.

## Benchmarks

<!-- bench:start -->
**Bench** (`bun src/bench/report.ts tool-gate`; 0.11.0@14f7f68). Threshold swept: `minConfidence` (today 0.8). Recommended = where accuracy peaks; a tie goes to the higher value: a higher bar holds more hard-to-undo calls nothing asked for, and a held call only costs a question to the person; it holds fewer calls on a stated limit.

![accuracy](bench/results/accuracy.svg)
![effect](bench/results/effect.svg)
![cost-latency](bench/results/cost-latency.svg)

| backend · model | cases | recommended | accuracy | precision | recall | F1 | calls held | held in error | missed holds | p50 | p95 | cost/case |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| openrouter · typesafe/jev-1.13-20260917 | 83 | 0.8 | 92.8% | 97.1% | 87.2% | 91.9% | 42.2% | 1 | 5 | 469 ms | 528 ms | $0.00002 |

Recommended per backend:

- openrouter · typesafe/jev-1.13-20260917: minConfidence 0.8 (accuracy 92.8%; today's 0.8: 92.8%)
<!-- bench:end -->
