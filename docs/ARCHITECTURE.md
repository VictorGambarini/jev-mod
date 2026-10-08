# Architecture

```
.claude-plugin/        plugin.json and marketplace.json: the repository is the plugin
hooks/hooks.json       → ../src/register.tsx
src/
  register.tsx         the only file that holds `$`; builds the IO, wires hooks to features
  core/                what every feature needs from Claude Code, through IO
    io.ts              the IO interface: everything the mod may do to the outside world
    jev.ts             the session's tally of backend calls, and the cool-off after a failure
    host.ts            the engine's Host, built from IO
    registry.ts        every feature, declared once: modes, default, knobs, help text
    config.ts          which features are on and how: kill files, /config, the project and user files, older switches
    settings.ts        jev's folder and private mode
    limits.ts          the daily budget, shared with the `jev` command
    memory.ts          per-session memory, one namespace per feature, in the mod's store
    activity.ts        what each feature did (or in shadow would have done), counted by day
  features/            one folder per feature
    command/           /jev-mod: index.ts · parse.ts and format.ts (pure) with their tests
    status/            /jev-mod status: index.ts · report.ts (pure) · report.test.ts
    dashboard/         /jev-mod dashboard (to come)
    routing/           index.ts (glue) · rules.ts (pure) · rules.test.ts
    skills/
    screening/         index.ts · targets.ts (pure) · targets.test.ts
    trim-output/       index.ts (glue, archive) · trim.ts (fold, chunk, drop: pure) · their tests
    compact/           /jev-mod compact: index.ts · keep.ts (pure) · keep.test.ts
  engine/              the decision engine, ported from jev-skills (docs/PORTING.md)
statusline/            the two-line status line (reads core/memory.ts's records)
test/parity/           fixtures captured from jev-skills; the engine port must match them
tools/parity/          the capture script
```

## Three layers

1. **`engine/`: decisions, with no Claude Code in it.** Request building, answer validation,
   backends, redaction, the injection screen, skill selection, the lane policy, transcript
   selection. It reaches the network and files only through the `IO` it is handed, so it is
   testable with a fake IO and reusable by anything that can provide one.
2. **`core/`: what every feature needs from Claude Code.** The engine's host, the call tally
   and its cool-off, jev's settings and budget, per-session memory, and (to come) per-turn facts and settings.
3. **`features/`: one folder each.** `index.ts` turns events into decisions using core; every
   rule worth testing lives in a plain file beside it with its tests.

## The rules the platform sets

These come from Claude Code's plugin validator and test kit (checked in the spike):

- **`$` never crosses an import.** The validator follows the engine handle only into functions
  declared in the same file. So `src/register.tsx` is the one file with `$`: it builds an `IO`
  (`ioOf($)`) and passes that everywhere. The validator still lists everything the mod reaches
  (`claude plugin validate .` shows each call "via ioOf").
- **Environment variables are named by literal** (`$.env.get('HOME')`), so the variables a mod
  reads can be listed. The IO has `home()`, not `env(name)`.
- **A command's own hook may not compact.** `/jev-mod compact` queues the built-in `/compact` with a
  marker from a timer, and answers that compaction itself.
- **The kit cannot raise `turn.step`, and does not route a mod's `$.process.run` to a test's
  stub.** It does stub `http.fetch`, `fs.read` and `env.get` (a stub answers `{ value: ... }`).
  So decisions live in pure files with kit tests, the engine reaches the network through
  `io.fetch` (stubbable), and the live behaviour is checked headless (`claude -p`, and
  stream-json sessions for anything that needs the session to stay open).

## State

- **Per turn:** module variables in each feature (a turn's prompt, its lane).
- **Per session:** `core/memory.ts`, `store["sessions"][id].features[<feature>]`. It survives
  `--continue`, `--resume` and restarts, and the status line reads it.
- **Per day:** `core/activity.ts`, `store["activity"][day][<feature>]`: each outcome's count and
  the backend's cost, for the last 30 local days. Counts gather in the process and are written
  one after another, so features counting at once lose nothing.
- **Settings:** `core/config.ts`, read from the layers on each use; `/jev-mod` writes the user
  or project file through `config.write` and `config.reset`.
- **Across sessions:** the decision backend's own config (keys, tuning), outside the mod.

## Tool results

One `tool.call` hook changes what a tool returned, in a fixed order: screening first (WebFetch,
WebSearch, MCP tools, Bash that fetches), then output trimming (every Bash output, a failed
command's included), on the text screening left. Each step is self-contained in the hook and
returns its own result or null; a step that returns null leaves the result as the step before it
made it, and a hook that changed nothing hands core the very object `next(e)` gave it.

## Failure

Every feature fails open: an answer it cannot get, or cannot trust, leaves the request as Claude
Code would have sent it. `core/jev.ts` stops asking for five minutes after a failure. A hook that
throws is skipped by the engine (it runs as if the hook were not there), which is also
fail-open, and also silent: test the glue live, not only the rules.

## Seams kept for what comes next

- **Routing targets.** Routing picks a model id today. The plan is a target:
  `{ kind: 'anthropic', model }`, `{ kind: 'gateway', alias }`, or `{ kind: 'local', endpoint }`
  answered by the mod itself, for local models.
- **One request per prompt.** Skills and routing each ask the engine at submit, in parallel.
  With the engine in TypeScript they become one request (the questions side by side).
- **A status row drawn by the mod** (`AbovePrompt`), from the same memory records.
